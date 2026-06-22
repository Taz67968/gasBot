import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { GeoService } from '@/geo/geo.service';
import { OrderStatus } from '@/common/enums/order-status.enum';
import { AgentStatus } from '@/common/enums/agent-status.enum';
import { DispatchService } from '@/dispatch/dispatch.service';
import { RedisService } from '@/redis/redis.service';
import { SupplierNotificationService } from './supplier-notification.service';
import {
  TimeoutCascadeJob,
} from './interfaces/matching-job.interface';
import { Agent } from '@/database/entities/agent.entity';
import {
  buildDispatchPayload,
  fetchOrderDispatchData,
} from './order-dispatch.helper';

const CASCADE_TTL = 30 * 60;

type CascadeCandidate = { agent: Agent; distanceMeters: number };

@Injectable()
export class MatchingCascadeService {
  private readonly logger = new Logger(MatchingCascadeService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly geoService: GeoService,
    private readonly dispatchService: DispatchService,
    private readonly supplierNotificationService: SupplierNotificationService,
    private readonly redisService: RedisService,
    @InjectQueue('driver-matching')
    private readonly matchingQueue: Queue,
  ) {}

  async beginCascade(orderId: string): Promise<void> {
    const orderData = await fetchOrderDispatchData(this.dataSource, orderId);
    if (!orderData) {
      await this.markWaitingForSupplier(orderId);
      return;
    }

    const lat = orderData.lat ? parseFloat(String(orderData.lat)) : 0;
    const lng = orderData.lng ? parseFloat(String(orderData.lng)) : 0;
    const hasGps = lat !== 0 || lng !== 0;

    let candidates: CascadeCandidate[] = [];

    if (hasGps) {
      candidates = await this.geoService.findNearestAgents(lat, lng, 5000);
      if (candidates.length === 0) {
        candidates = await this.geoService.findNearestAgents(lat, lng, 10000);
      }
    }

    if (candidates.length === 0) {
      const allActiveRows = await this.dataSource.query(
        `SELECT * FROM agents WHERE status = $1`,
        [AgentStatus.ACTIVE],
      );

      if (allActiveRows.length === 0) {
        this.logger.warn(`No ACTIVE suppliers for order ${orderId}`);
        await this.markWaitingForSupplier(orderId);
        return;
      }

      this.logger.log(
        `Broadcasting order ${orderId} to ${allActiveRows.length} active supplier(s)`,
      );
      await this.supplierNotificationService.notifyAllActive(orderId, orderData);
      return;
    }

    candidates = candidates.sort((a, b) => a.distanceMeters - b.distanceMeters);
    const agentIds = candidates.map((c) => c.agent.id);

    await this.saveCascadeState(orderId, agentIds, 0);

    const firstAgent = candidates[0];
    await this.offerToSupplier(
      orderId,
      firstAgent.agent.id,
      0,
      firstAgent.distanceMeters,
    );
  }

  async advanceAfterDecline(orderId: string, agentId: string): Promise<void> {
    const [orderRow] = await this.dataSource.query(
      `SELECT agent_id FROM orders WHERE id = $1`,
      [orderId],
    );

    if (orderRow?.agent_id) {
      return;
    }

    const state = await this.loadCascadeState(orderId);
    if (!state) {
      return;
    }

    const { agentIds, currentIndex } = state;
    if (agentIds[currentIndex] !== agentId) {
      return;
    }

    await this.advanceToNextSupplier(orderId, currentIndex);
  }

  async advanceAfterTimeout(
    orderId: string,
    agentId: string,
    attemptIndex: number,
  ): Promise<void> {
    const [orderRow] = await this.dataSource.query(
      `SELECT agent_id FROM orders WHERE id = $1`,
      [orderId],
    );

    if (orderRow?.agent_id) {
      return;
    }

    const state = await this.loadCascadeState(orderId);
    if (!state) {
      return;
    }

    const { agentIds, currentIndex } = state;
    if (agentIds[currentIndex] !== agentId || currentIndex !== attemptIndex) {
      return;
    }

    this.logger.warn(
      `90s timeout reached for supplier ${agentId} on order ${orderId}`,
    );

    const [agent] = await this.dataSource.query(
      `SELECT phone FROM agents WHERE id = $1`,
      [agentId],
    );
    if (agent) {
      const orderData = await fetchOrderDispatchData(this.dataSource, orderId);
      await this.dispatchService.sendDeclineTimeout(
        agent.phone,
        orderData?.reference || orderId.slice(0, 8),
      );
    }

    await this.advanceToNextSupplier(orderId, attemptIndex);
  }

  private async offerToSupplier(
    orderId: string,
    agentId: string,
    attemptIndex: number,
    distanceMeters: number,
  ): Promise<void> {
    const orderData = await fetchOrderDispatchData(this.dataSource, orderId);
    const [agentRow] = await this.dataSource.query(
      `SELECT phone FROM agents WHERE id = $1`,
      [agentId],
    );

    if (!orderData || !agentRow) {
      await this.advanceToNextSupplier(orderId, attemptIndex);
      return;
    }

    const payload = buildDispatchPayload(orderData, distanceMeters);

    try {
      await this.dispatchService.sendAssignmentOffer(
        agentRow.phone,
        payload,
        orderId,
      );
      this.logger.log(
        `Supplier notification sent to ${agentId} (${distanceMeters}m away) for order ${orderId}`,
      );
    } catch (error: any) {
      this.logger.error(
        `Failed to offer order ${orderId} to ${agentId}: ${error.message}`,
      );
      await this.advanceToNextSupplier(orderId, attemptIndex);
      return;
    }

    await this.scheduleTimeout(orderId, agentId, attemptIndex);
  }

  private async advanceToNextSupplier(
    orderId: string,
    _currentAttemptIndex: number,
  ): Promise<void> {
    const state = await this.loadCascadeState(orderId);
    if (!state) {
      await this.markWaitingForSupplier(orderId);
      return;
    }

    const { agentIds, currentIndex } = state;
    const nextIndex = currentIndex + 1;

    if (nextIndex >= agentIds.length) {
      await this.clearCascadeState(orderId);
      await this.markWaitingForSupplier(orderId);
      return;
    }

    await this.saveCascadeState(orderId, agentIds, nextIndex);

    const [nextAgent] = await this.dataSource.query(
      `SELECT ST_Distance(a.location, (SELECT delivery_location FROM orders WHERE id = $1)) AS distance_meters FROM agents a WHERE a.id = $2`,
      [orderId, agentIds[nextIndex]],
    );

    const nextDistance = nextAgent
      ? Math.round(parseFloat(nextAgent.distance_meters))
      : 0;

    await this.offerToSupplier(
      orderId,
      agentIds[nextIndex],
      nextIndex,
      nextDistance,
    );
  }

  private async markWaitingForSupplier(orderId: string): Promise<void> {
    await this.dataSource.query(
      `UPDATE orders SET status = $1, updated_at = NOW() WHERE id = $2 AND agent_id IS NULL`,
      [OrderStatus.WAITING_FOR_SUPPLIER, orderId],
    );

    this.logger.log(
      `Order ${orderId} moved to WAITING_FOR_SUPPLIER (no suppliers found)`,
    );

    const orderData = await fetchOrderDispatchData(this.dataSource, orderId);
    const [order] = await this.dataSource.query(
      `SELECT customer_id FROM orders WHERE id = $1`,
      [orderId],
    );
    if (order) {
      const [customer] = await this.dataSource.query(
        `SELECT phone FROM customers WHERE id = $1`,
        [order.customer_id],
      );
      if (customer) {
        await this.dispatchService.sendNoSuppliersAvailable(
          customer.phone,
          orderData?.reference || orderId.slice(0, 8),
        );
      }
    }
  }

  private async scheduleTimeout(
    orderId: string,
    agentId: string,
    attemptIndex: number,
  ): Promise<void> {
    const timeoutData: TimeoutCascadeJob = {
      orderId,
      agentId,
      attemptIndex,
    };

    try {
      await this.matchingQueue.add('TIMEOUT_CASCADE', timeoutData, {
        delay: 90_000,
        removeOnComplete: true,
        removeOnFail: 50,
      });
    } catch (error: any) {
      this.logger.warn(
        `Could not schedule timeout for order ${orderId} (Redis unavailable): ${error.message}`,
      );
    }
  }

  private cascadeKey(orderId: string): string {
    return `matching:cascade:${orderId}`;
  }

  private async saveCascadeState(
    orderId: string,
    agentIds: string[],
    currentIndex: number,
  ): Promise<void> {
    try {
      const redis = this.redisService.getClient();
      await redis.setex(
        this.cascadeKey(orderId),
        CASCADE_TTL,
        JSON.stringify({ agentIds, currentIndex }),
      );
    } catch (error: any) {
      this.logger.warn(
        `Could not save cascade state for order ${orderId}: ${error.message}`,
      );
    }
  }

  private async loadCascadeState(
    orderId: string,
  ): Promise<{ agentIds: string[]; currentIndex: number } | null> {
    try {
      const redis = this.redisService.getClient();
      const raw = await redis.get(this.cascadeKey(orderId));
      return raw ? JSON.parse(raw) : null;
    } catch (error: any) {
      this.logger.warn(
        `Could not load cascade state for order ${orderId}: ${error.message}`,
      );
      return null;
    }
  }

  private async clearCascadeState(orderId: string): Promise<void> {
    try {
      const redis = this.redisService.getClient();
      await redis.del(this.cascadeKey(orderId));
    } catch {
      // non-fatal
    }
  }
}
