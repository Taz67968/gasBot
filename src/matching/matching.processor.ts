import {
  Processor,
  WorkerHost,
  OnWorkerEvent,
  InjectQueue,
} from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { GeoService } from '@/geo/geo.service';
import { OrderStatus } from '@/common/enums/order-status.enum';
import { AgentStatus } from '@/common/enums/agent-status.enum';
import { DispatchService } from '@/dispatch/dispatch.service';
import { RedisService } from '@/redis/redis.service';
import {
  StartCascadeJob,
  TimeoutCascadeJob,
  DeclineCascadeJob,
} from './interfaces/matching-job.interface';
import { Agent } from '@/database/entities/agent.entity';
import {
  buildDispatchPayload,
  fetchOrderDispatchData,
} from './order-dispatch.helper';

const CASCADE_TTL = 30 * 60;

@Processor('driver-matching')
@Injectable()
export class MatchingProcessor extends WorkerHost {
  private readonly logger = new Logger(MatchingProcessor.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly geoService: GeoService,
    private readonly dispatchService: DispatchService,
    @InjectQueue('driver-matching')
    private readonly matchingQueue: Queue,
    private readonly redisService: RedisService,
  ) {
    super();
  }

  private getRedis() {
    return this.redisService.getClient();
  }

  async process(
    job: Job<StartCascadeJob | TimeoutCascadeJob | DeclineCascadeJob, any, string>,
  ): Promise<any> {
    if (job.name === 'START_CASCADE') {
      return this.handleStartCascade(job.data as StartCascadeJob);
    }

    if (job.name === 'TIMEOUT_CASCADE') {
      return this.handleTimeout(job.data as TimeoutCascadeJob);
    }

    if (job.name === 'DECLINE_CASCADE') {
      return this.handleDecline(job.data as DeclineCascadeJob);
    }

    throw new Error(`Unknown job type: ${job.name}`);
  }

  private async handleStartCascade(data: StartCascadeJob): Promise<void> {
    const { orderId, initialRadiusMeters, maxRadiusMeters } = data;

    const orderData = await fetchOrderDispatchData(this.dataSource, orderId);
    if (!orderData) {
      await this.markWaitingForSupplier(orderId);
      return;
    }

    const lat = orderData.lat ? parseFloat(String(orderData.lat)) : 0;
    const lng = orderData.lng ? parseFloat(String(orderData.lng)) : 0;
    const hasGps = lat !== 0 || lng !== 0;

    let candidates: Array<{ agent: Agent; distanceMeters: number }> = [];

    if (hasGps) {
      candidates = await this.geoService.findNearestAgents(
        lat,
        lng,
        initialRadiusMeters,
      );

      if (candidates.length === 0) {
        candidates = await this.geoService.findNearestAgents(
          lat,
          lng,
          maxRadiusMeters,
        );
      }
    }

    if (candidates.length === 0) {
      const allActiveRows = await this.dataSource.query(
        `SELECT * FROM agents WHERE status = $1`,
        [AgentStatus.ACTIVE],
      );

      if (allActiveRows.length === 0) {
        await this.markWaitingForSupplier(orderId);
        return;
      }

      this.logger.warn(
        `No geo-located agents found for order ${orderId} — broadcasting to all ${allActiveRows.length} active agent(s)`,
      );

      candidates = allActiveRows.map((row: any) => ({
        agent: Object.assign(new Agent(), row) as Agent,
        distanceMeters: 0,
      }));
    }

    candidates = candidates.sort((a, b) => a.distanceMeters - b.distanceMeters);

    const cascadeKey = `matching:cascade:${orderId}`;
    const agentIds = candidates.map((c) => c.agent.id);

    await this.getRedis().setex(
      cascadeKey,
      CASCADE_TTL,
      JSON.stringify({ agentIds, currentIndex: 0 }),
    );

    const firstAgent = candidates[0];
    await this.offerToSupplier(
      orderId,
      firstAgent.agent.id,
      0,
      firstAgent.distanceMeters,
    );
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

    const timeoutData: TimeoutCascadeJob = {
      orderId,
      agentId,
      attemptIndex,
    };

    await this.matchingQueue.add('TIMEOUT_CASCADE', timeoutData, {
      delay: 90_000,
      removeOnComplete: true,
      removeOnFail: 50,
    });
  }

  private async handleTimeout(data: TimeoutCascadeJob): Promise<void> {
    const { orderId, agentId, attemptIndex } = data;

    const [orderRow] = await this.dataSource.query(
      `SELECT status, agent_id FROM orders WHERE id = $1`,
      [orderId],
    );

    if (!orderRow || orderRow.agent_id !== null) {
      return;
    }

    const cascadeKey = `matching:cascade:${orderId}`;
    const raw = await this.getRedis().get(cascadeKey);
    if (!raw) {
      return;
    }

    const { agentIds, currentIndex } = JSON.parse(raw);
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

  private async handleDecline(data: DeclineCascadeJob): Promise<void> {
    const { orderId, agentId } = data;

    const [orderRow] = await this.dataSource.query(
      `SELECT agent_id FROM orders WHERE id = $1`,
      [orderId],
    );

    if (orderRow?.agent_id) {
      return;
    }

    const cascadeKey = `matching:cascade:${orderId}`;
    const raw = await this.getRedis().get(cascadeKey);
    if (!raw) {
      return;
    }

    const { agentIds, currentIndex } = JSON.parse(raw);
    if (agentIds[currentIndex] !== agentId) {
      return;
    }

    await this.advanceToNextSupplier(orderId, currentIndex);
  }

  private async advanceToNextSupplier(
    orderId: string,
    _currentAttemptIndex: number,
  ): Promise<void> {
    const cascadeKey = `matching:cascade:${orderId}`;
    const raw = await this.getRedis().get(cascadeKey);

    if (!raw) {
      await this.markWaitingForSupplier(orderId);
      return;
    }

    const { agentIds, currentIndex } = JSON.parse(raw);

    const nextIndex = currentIndex + 1;

    if (nextIndex >= agentIds.length) {
      await this.getRedis().del(cascadeKey);
      await this.markWaitingForSupplier(orderId);
      return;
    }

    await this.getRedis().setex(
      cascadeKey,
      CASCADE_TTL,
      JSON.stringify({ agentIds, currentIndex: nextIndex }),
    );

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

  @OnWorkerEvent('failed')
  onFailed(job: Job, error: Error) {
    this.logger.error(`Matching job ${job.id} failed: ${error.message}`);
  }
}
