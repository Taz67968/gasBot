import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { GeoService } from '@/geo/geo.service';
import { OrderStatus } from '@/common/enums/order-status.enum';
import { StartCascadeJob } from './interfaces/matching-job.interface';
import { SupplierNotificationService } from './supplier-notification.service';
import { DispatchService } from '@/dispatch/dispatch.service';
import { DispatchPayload } from '@/dispatch/dispatch.service';

@Injectable()
export class MatchingService {
  private readonly logger = new Logger(MatchingService.name);

  constructor(
    @InjectQueue('driver-matching')
    private readonly matchingQueue: Queue,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly geoService: GeoService,
    private readonly supplierNotificationService: SupplierNotificationService,
    private readonly dispatchService: DispatchService,
  ) {}

  async startAssignmentCascade(orderId: string): Promise<void> {
    const orderRows = await this.dataSource.query(
      `SELECT id, status, delivery_location, total_xaf FROM orders WHERE id = $1`,
      [orderId],
    );

    if (!orderRows.length || orderRows[0].status !== OrderStatus.CASH_ACKNOWLEDGED) {
      this.logger.warn(`Cannot start cascade for order ${orderId} - invalid state`);
      return;
    }

    const pointText: string | undefined = orderRows[0].delivery_location
      ? await this.dataSource.query(`SELECT ST_AsText(delivery_location) as point FROM orders WHERE id = $1`, [orderId])
          .then((r) => r[0]?.point)
      : undefined;

    if (!pointText) {
      this.logger.error(`Order ${orderId} has no delivery location`);
      await this.supplierNotificationService.notifyAllActive(orderId);
      return;
    }

    const coordinateMatch = pointText.match(/POINT\(([^ ]+) ([^)]+)\)/);
    if (!coordinateMatch) {
      this.logger.error(`Invalid geometry for order ${orderId}`);
      await this.supplierNotificationService.notifyAllActive(orderId);
      return;
    }

    const lng = parseFloat(coordinateMatch[1]);
    const lat = parseFloat(coordinateMatch[2]);

    let candidates = await this.geoService.findNearestAgents(lat, lng, 5000);
    if (candidates.length === 0) {
      candidates = await this.geoService.findNearestAgents(lat, lng, 10000);
    }

    if (candidates.length === 0) {
      this.logger.warn(`No geo-located agents for order ${orderId} — broadcasting to all ACTIVE agents`);
      await this.supplierNotificationService.notifyAllActive(orderId);
      return;
    }

    candidates = candidates.sort((a: any, b: any) => a.distanceMeters - b.distanceMeters);
    const firstAgent = candidates[0];

    const [orderDetails] = await this.dataSource.query(
      `SELECT bottle_image_media_id FROM orders WHERE id = $1`,
      [orderId],
    );

    const totalXaf = orderRows[0].total_xaf || 0;
    const payload: DispatchPayload = {
      orderReference: orderId.slice(0, 8),
      gasType: 'Gas Cylinder',
      sizeKg: 12,
      amountXaf: totalXaf,
      estimatedDistanceMeters: firstAgent.distanceMeters,
      bottleImageMediaId: orderDetails?.bottle_image_media_id || undefined,
      deliveryLat: lat,
      deliveryLng: lng,
    };

    try {
      await this.dispatchService.sendAssignmentOffer(
        firstAgent.agent.phone,
        payload,
        orderId,
      );
      this.logger.log(`Supplier notification sent to ${firstAgent.agent.id} (${firstAgent.distanceMeters}m away) for order ${orderId}`);
    } catch (error: any) {
      this.logger.error(`Failed to send offer to agent ${firstAgent.agent.id}: ${error.message}`);
      await this.advanceToNextSupplier(orderId, firstAgent.agent.id, firstAgent.distanceMeters, totalXaf, candidates);
      return;
    }

    const jobData: StartCascadeJob = {
      orderId,
      initialRadiusMeters: 5000,
      maxRadiusMeters: 10000,
    };

    try {
      await this.matchingQueue.add('START_CASCADE', jobData, {
        removeOnComplete: true,
        removeOnFail: 100,
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
      });
      this.logger.log(`Enqueued START_CASCADE for order ${orderId}`);
    } catch (queueErr: unknown) {
      const message = queueErr instanceof Error ? queueErr.message : 'Unknown error';
      this.logger.error(`Failed to enqueue matching job for order ${orderId}: ${message}`);
      // Initial offer already sent, continue without queue state
    }

    this.logger.log(`Started driver matching cascade for order ${orderId} at (${lat}, ${lng})`);
  }

  private async advanceToNextSupplier(
    orderId: string,
    currentAgentId: string,
    _currentDistanceMeters: number,
    totalXaf: number,
    candidates: any[],
  ): Promise<void> {
    const currentIndex = candidates.findIndex((c) => c.agent.id === currentAgentId);
    const nextIndex = currentIndex + 1;

    if (nextIndex >= candidates.length) {
      await this.markWaitingForSupplier(orderId);
      return;
    }

    const nextCandidate = candidates[nextIndex];
    const [nextOrderDetails] = await this.dataSource.query(
      `SELECT bottle_image_media_id FROM orders WHERE id = $1`,
      [orderId],
    );
    const payload: DispatchPayload = {
      orderReference: orderId.slice(0, 8),
      gasType: 'Gas Cylinder',
      sizeKg: 12,
      amountXaf: totalXaf,
      estimatedDistanceMeters: nextCandidate.distanceMeters,
      bottleImageMediaId: nextOrderDetails?.bottle_image_media_id,
    };

    try {
      await this.dispatchService.sendAssignmentOffer(
        nextCandidate.agent.phone,
        payload,
        orderId,
      );
      this.logger.log(`Advanced notification to supplier ${nextCandidate.agent.id} (${nextCandidate.distanceMeters}m away) for order ${orderId}`);
    } catch (error: any) {
      this.logger.error(`Failed to offer to next supplier ${nextCandidate.agent.id}: ${error.message}`);
      await this.advanceToNextSupplier(orderId, nextCandidate.agent.id, nextCandidate.distanceMeters, totalXaf, candidates);
    }
  }

  private async markWaitingForSupplier(orderId: string): Promise<void> {
    await this.dataSource.query(
      `UPDATE orders SET status = $1, updated_at = NOW() WHERE id = $2`,
      [OrderStatus.WAITING_FOR_SUPPLIER, orderId],
    );

    this.logger.log(`Order ${orderId} moved to WAITING_FOR_SUPPLIER (no suppliers found)`);

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
          orderId.slice(0, 8),
        );
      }
    }
  }
}
