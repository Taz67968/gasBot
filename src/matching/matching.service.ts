import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { GeoService } from '@/geo/geo.service';
import { OrderStatus } from '@/common/enums/order-status.enum';
import { StartCascadeJob } from './interfaces/matching-job.interface';

/**
 * MatchingService
 * High-level API to trigger geospatial driver assignment cascades.
 * Uses BullMQ for reliable, retryable, delayed task orchestration.
 */
@Injectable()
export class MatchingService {
  private readonly logger = new Logger(MatchingService.name);

  constructor(
    @InjectQueue('driver-matching')
    private readonly matchingQueue: Queue,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    _geoService: GeoService, // reserved for future radius pre-filtering
  ) {}

  /**
   * Starts the real-time geospatial driver assignment cascade for a confirmed order.
   * Called after CASH_ACKNOWLEDGEMENT when the customer has confirmed payment method.
   */
  async startAssignmentCascade(orderId: string): Promise<void> {
    // Verify the order is in the correct state
    const orderRows = await this.dataSource.query(
      `SELECT id, status, delivery_location FROM orders WHERE id = $1`,
      [orderId],
    );

    if (
      !orderRows.length ||
      orderRows[0].status !== OrderStatus.CASH_ACKNOWLEDGED
    ) {
      this.logger.warn(
        `Cannot start cascade for order ${orderId} - invalid state`,
      );
      return;
    }

    // Parse PostGIS geography point to get lat/lng (stored as WKT or binary, we use ST_AsText)
    const pointText: string = await this.dataSource
      .query(
        `SELECT ST_AsText(delivery_location) as point FROM orders WHERE id = $1`,
        [orderId],
      )
      .then((r) => r[0]?.point);

    if (!pointText) {
      this.logger.error(`Order ${orderId} has no delivery location`);
      return;
    }

    // Extract coordinates from "POINT(lng lat)"
    const match = pointText.match(/POINT\(([^ ]+) ([^)]+)\)/);
    if (!match) {
      this.logger.error(`Invalid geometry for order ${orderId}`);
      return;
    }

    const lng = parseFloat(match[1]);
    const lat = parseFloat(match[2]);

    // Enqueue the initial cascade job (starts at 5km)
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
    } catch (queueError: any) {
      this.logger.error(`Failed to enqueue matching cascade for order ${orderId}: ${queueError.message}. Redis may be unavailable — supplier notifications will not be sent until Redis is restored.`);
    }

    this.logger.log(
      `Started driver matching cascade for order ${orderId} at (${lat}, ${lng})`,
    );
  }
}
