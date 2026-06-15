import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { GeoService } from '@/geo/geo.service';
import { OrderStatus } from '@/common/enums/order-status.enum';
import { StartCascadeJob } from './interfaces/matching-job.interface';
import { SupplierNotificationService } from './supplier-notification.service';

@Injectable()
export class MatchingService {
  private readonly logger = new Logger(MatchingService.name);

  constructor(
    @InjectQueue('driver-matching')
    private readonly matchingQueue: Queue,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    _geoService: GeoService,
    private readonly supplierNotificationService: SupplierNotificationService,
  ) {}

  async startAssignmentCascade(orderId: string): Promise<void> {
    const orderRows = await this.dataSource.query(
      `SELECT id, status, delivery_location FROM orders WHERE id = $1`,
      [orderId],
    );

    if (!orderRows.length || orderRows[0].status !== OrderStatus.CASH_ACKNOWLEDGED) {
      this.logger.warn(`Cannot start cascade for order ${orderId} - invalid state`);
      return;
    }

    const pointText: string | undefined = await this.dataSource
      .query(`SELECT ST_AsText(delivery_location) as point FROM orders WHERE id = $1`, [orderId])
      .then((r) => r[0]?.point);

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

    const jobData: StartCascadeJob = {
      orderId,
      initialRadiusMeters: 5000,
      maxRadiusMeters: 10000,
    };

    await this.matchingQueue.add('START_CASCADE', jobData, {
      removeOnComplete: true,
      removeOnFail: 100,
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
    });

    this.logger.log(`Started driver matching cascade for order ${orderId} at (${lat}, ${lng})`);
  }
}
