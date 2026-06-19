import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { OrderStatus } from '@/common/enums/order-status.enum';
import { StartCascadeJob } from './interfaces/matching-job.interface';
import { SupplierNotificationService } from './supplier-notification.service';
import { fetchOrderDispatchData } from './order-dispatch.helper';

@Injectable()
export class MatchingService {
  private readonly logger = new Logger(MatchingService.name);

  constructor(
    @InjectQueue('driver-matching')
    private readonly matchingQueue: Queue,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly supplierNotificationService: SupplierNotificationService,
  ) {}

  async startAssignmentCascade(orderId: string): Promise<void> {
    const orderRows = await this.dataSource.query(
      `SELECT id, status FROM orders WHERE id = $1`,
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

    const orderData = await fetchOrderDispatchData(this.dataSource, orderId);
    if (!orderData) {
      this.logger.error(`Order ${orderId} not found for cascade`);
      return;
    }

    const hasGps =
      orderData.lat !== undefined &&
      orderData.lng !== undefined &&
      (parseFloat(String(orderData.lat)) !== 0 ||
        parseFloat(String(orderData.lng)) !== 0);

    if (!hasGps && !orderData.delivery_address_text) {
      this.logger.warn(
        `Order ${orderId} has no GPS or manual address — broadcasting`,
      );
      await this.supplierNotificationService.notifyAllActive(orderId, orderData);
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
      const message =
        queueErr instanceof Error ? queueErr.message : 'Unknown error';
      this.logger.error(
        `Failed to enqueue matching job for order ${orderId}: ${message}`,
      );
      await this.supplierNotificationService.notifyAllActive(orderId, orderData);
    }
  }

  async handleSupplierDecline(orderId: string, agentId: string): Promise<void> {
    await this.matchingQueue.add(
      'DECLINE_CASCADE',
      { orderId, agentId },
      { removeOnComplete: true, removeOnFail: 50 },
    );
  }
}
