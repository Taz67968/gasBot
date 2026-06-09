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
import { DispatchService, DispatchPayload } from '@/dispatch/dispatch.service';
import { RedisService } from '@/redis/redis.service';
import {
  StartCascadeJob,
  TimeoutCascadeJob,
} from './interfaces/matching-job.interface';
import { Agent } from '@/database/entities/agent.entity';

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
    job: Job<StartCascadeJob | TimeoutCascadeJob, any, string>,
  ): Promise<any> {
    if (job.name === 'START_CASCADE') {
      return this.handleStartCascade(job.data as StartCascadeJob);
    }

    if (job.name === 'TIMEOUT_CASCADE') {
      return this.handleTimeout(job.data as TimeoutCascadeJob);
    }

    throw new Error(`Unknown job type: ${job.name}`);
  }

  private async handleStartCascade(data: StartCascadeJob): Promise<void> {
    const { orderId, initialRadiusMeters, maxRadiusMeters } = data;

    const [orderRow] = await this.dataSource.query(
      `SELECT ST_AsText(delivery_location) as point, total_xaf FROM orders WHERE id = $1`,
      [orderId],
    );

    if (!orderRow?.point) {
      await this.markWaitingForSupplier(orderId);
      return;
    }

    const match = orderRow.point.match(/POINT\(([^ ]+) ([^)]+)\)/);
    if (!match) {
      await this.markWaitingForSupplier(orderId);
      return;
    }

    const lng = parseFloat(match[1]);
    const lat = parseFloat(match[2]);

    let candidates = await this.geoService.findNearestAgents(
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

    // ── Fallback: notify ALL active agents who have not yet set their GPS location ──
    // This covers suppliers who registered via the WhatsApp chat and have no
    // location entry yet.  Once they update their location the geo cascade takes over.
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

      // Build synthetic candidates with 0 distance so the rest of the pipeline works
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
    await this.offerToSupplier(orderId, firstAgent.agent.id, 0, firstAgent.distanceMeters, orderRow.total_xaf);
  }

  private async offerToSupplier(
    orderId: string,
    agentId: string,
    attemptIndex: number,
    distanceMeters: number,
    totalXaf: number,
  ): Promise<void> {
    // Fetch order details including bottle image if any
    const [orderDetails] = await this.dataSource.query(
      `SELECT o.total_xaf, o.bottle_image_media_id FROM orders o WHERE o.id = $1`,
      [orderId],
    );

    const [agentRow] = await this.dataSource.query(
      `SELECT phone FROM agents WHERE id = $1`,
      [agentId],
    );

    if (!agentRow) {
      await this.advanceToNextSupplier(orderId, attemptIndex);
      return;
    }

    const agentPhone = agentRow.phone;

    const payload: DispatchPayload = {
      orderReference: orderId.slice(0, 8),
      gasType: 'Gas Cylinder',
      sizeKg: 12,
      amountXaf: totalXaf,
      estimatedDistanceMeters: distanceMeters,
      bottleImageMediaId: orderDetails?.bottle_image_media_id,
    };

    try {
      await this.dispatchService.sendAssignmentOffer(agentPhone, payload, orderId);
      this.logger.log(`Supplier notification sent to ${agentId} (${distanceMeters}m away) for order ${orderId}`);
    } catch (error: any) {
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

    if (
      !orderRow ||
      orderRow.status !== OrderStatus.SUPPLIER_ASSIGNED ||
      orderRow.agent_id !== agentId
    ) {
      return;
    }

    this.logger.warn(`90s timeout reached for supplier ${agentId} on order ${orderId}`);

    const [agent] = await this.dataSource.query(`SELECT phone FROM agents WHERE id = $1`, [agentId]);
    if (agent) {
      await this.dispatchService.sendDeclineTimeout(agent.phone, orderId.slice(0, 8));
    }

    await this.advanceToNextSupplier(orderId, attemptIndex);
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

    const nextDistance = nextAgent ? Math.round(parseFloat(nextAgent.distance_meters)) : 0;
    const [orderDetails] = await this.dataSource.query(`SELECT total_xaf FROM orders WHERE id = $1`, [orderId]);
    await this.offerToSupplier(orderId, agentIds[nextIndex], nextIndex, nextDistance, orderDetails?.total_xaf || 0);
  }

  private async markWaitingForSupplier(orderId: string): Promise<void> {
    await this.dataSource.query(
      `UPDATE orders SET status = $1, updated_at = NOW() WHERE id = $2`,
      [OrderStatus.WAITING_FOR_SUPPLIER, orderId],
    );

    this.logger.log(`Order ${orderId} moved to WAITING_FOR_SUPPLIER (no suppliers found)`);

    const [order] = await this.dataSource.query(`SELECT customer_id FROM orders WHERE id = $1`, [orderId]);
    if (order) {
      const [customer] = await this.dataSource.query(`SELECT phone FROM customers WHERE id = $1`, [order.customer_id]);
      if (customer) {
        await this.dispatchService.sendNoSuppliersAvailable(customer.phone, orderId.slice(0, 8));
      }
    }
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, error: Error) {
    this.logger.error(`Matching job ${job.id} failed: ${error.message}`);
  }
}
