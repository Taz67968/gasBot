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
import { DispatchService } from '@/dispatch/dispatch.service';
import { RedisService } from '@/redis/redis.service';
import {
  StartCascadeJob,
  TimeoutCascadeJob,
} from './interfaces/matching-job.interface';

const CASCADE_TTL = 30 * 60; // 30 minutes max cascade lifetime

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

  // === START CASCADE ===
  private async handleStartCascade(data: StartCascadeJob): Promise<void> {
    const { orderId, initialRadiusMeters, maxRadiusMeters } = data;

    // Get delivery coordinates
    const [orderRow] = await this.dataSource.query(
      `SELECT ST_AsText(delivery_location) as point FROM orders WHERE id = $1`,
      [orderId],
    );

    if (!orderRow?.point) {
      await this.markWaitingForAgent(orderId);
      return;
    }

    const match = orderRow.point.match(/POINT\(([^ ]+) ([^)]+)\)/);
    if (!match) {
      await this.markWaitingForAgent(orderId);
      return;
    }

    const lng = parseFloat(match[1]);
    const lat = parseFloat(match[2]);

    // First attempt: 5km
    let candidates = await this.geoService.findNearestAgents(
      lat,
      lng,
      initialRadiusMeters,
    );

    // Second attempt: 10km if needed
    if (candidates.length === 0) {
      candidates = await this.geoService.findNearestAgents(
        lat,
        lng,
        maxRadiusMeters,
      );
    }

    if (candidates.length === 0) {
      await this.markWaitingForAgent(orderId);
      return;
    }

    // Store candidate list + current index in Redis for the cascade
    const cascadeKey = `matching:cascade:${orderId}`;
    const agentIds = candidates.map((c) => c.agent.id);

    await this.getRedis().setex(
      cascadeKey,
      CASCADE_TTL,
      JSON.stringify({ agentIds, currentIndex: 0 }),
    );

    // Start with the first (closest) agent
    await this.offerToAgent(orderId, agentIds[0], 0);
  }

  // === OFFER TO SINGLE AGENT ===
  private async offerToAgent(
    orderId: string,
    agentId: string,
    attemptIndex: number,
  ): Promise<void> {
    // Fetch agent phone
    const [agentRow] = await this.dataSource.query(
      `SELECT phone, full_name FROM agents WHERE id = $1`,
      [agentId],
    );

    if (!agentRow) {
      await this.advanceToNextAgent(orderId, attemptIndex);
      return;
    }

    const agentPhone = agentRow.phone;

    // Send rich conversational dispatch offer via DispatchService
    await this.dispatchService.sendAssignmentOffer(
      agentPhone,
      {
        orderReference: orderId.slice(0, 8),
        gasType: 'Standard Gas Cylinder',
        sizeKg: 12,
        amountXaf: 8500,
        estimatedDistanceMeters: 4200,
      },
      orderId,
    );

    this.logger.log(
      `Rich dispatch offer sent to agent ${agentId} for order ${orderId}`,
    );

    // Schedule 90-second timeout job
    const timeoutData: TimeoutCascadeJob = {
      orderId,
      agentId,
      attemptIndex,
    };

    // Add delayed job to the same queue
    await this.matchingQueue.add('TIMEOUT_CASCADE', timeoutData, {
      delay: 90_000, // exactly 90 seconds
      removeOnComplete: true,
      removeOnFail: 50,
    });
  }

  // === TIMEOUT HANDLER ===
  private async handleTimeout(data: TimeoutCascadeJob): Promise<void> {
    const { orderId, agentId, attemptIndex } = data;

    // Check if this agent is still the current assignee
    const [orderRow] = await this.dataSource.query(
      `SELECT status, agent_id FROM orders WHERE id = $1`,
      [orderId],
    );

    if (
      !orderRow ||
      orderRow.status !== OrderStatus.AGENT_ASSIGNED ||
      orderRow.agent_id !== agentId
    ) {
      // Already moved on or accepted by someone else
      return;
    }

    this.logger.warn(
      `90s timeout reached for agent ${agentId} on order ${orderId}`,
    );

    await this.advanceToNextAgent(orderId, attemptIndex);
  }

  // === ADVANCE TO NEXT AGENT IN CASCADE ===
  private async advanceToNextAgent(
    orderId: string,
    _currentAttemptIndex: number,
  ): Promise<void> {
    const cascadeKey = `matching:cascade:${orderId}`;
    const raw = await this.getRedis().get(cascadeKey);

    if (!raw) {
      await this.markWaitingForAgent(orderId);
      return;
    }

    const { agentIds, currentIndex } = JSON.parse(raw);

    const nextIndex = currentIndex + 1;

    if (nextIndex >= agentIds.length) {
      await this.getRedis().del(cascadeKey);
      await this.markWaitingForAgent(orderId);
      return;
    }

    // Update index in Redis
    await this.getRedis().setex(
      cascadeKey,
      CASCADE_TTL,
      JSON.stringify({ agentIds, currentIndex: nextIndex }),
    );

    const nextAgentId = agentIds[nextIndex];
    await this.offerToAgent(orderId, nextAgentId, nextIndex);
  }

  // === FINAL STATE WHEN NO AGENTS AVAILABLE ===
  private async markWaitingForAgent(orderId: string): Promise<void> {
    await this.dataSource.query(
      `UPDATE orders SET status = $1, updated_at = NOW() WHERE id = $2`,
      [OrderStatus.WAITING_FOR_AGENT, orderId],
    );

    this.logger.log(
      `Order ${orderId} moved to WAITING_FOR_AGENT (no drivers found)`,
    );

    // TODO: notify customer that we are looking for a driver
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, error: Error) {
    this.logger.error(`Matching job ${job.id} failed: ${error.message}`);
  }
}
