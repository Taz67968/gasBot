import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { OrderStatus } from '@/common/enums/order-status.enum';
import { MatchingCascadeService } from './matching-cascade.service';
import { SupplierNotificationService } from './supplier-notification.service';
import { fetchOrderDispatchData } from './order-dispatch.helper';

@Injectable()
export class MatchingService {
  private readonly logger = new Logger(MatchingService.name);

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly cascadeService: MatchingCascadeService,
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

    try {
      this.logger.log(`Starting supplier cascade for order ${orderId}`);
      await this.cascadeService.beginCascade(orderId);
      this.logger.log(`Supplier cascade started for order ${orderId}`);
    } catch (error: any) {
      this.logger.error(
        `Cascade failed for order ${orderId}: ${error.message}. Broadcasting to all suppliers.`,
      );
      await this.supplierNotificationService.notifyAllActive(orderId, orderData);
    }
  }

  async handleSupplierDecline(orderId: string, agentId: string): Promise<void> {
    try {
      await this.cascadeService.advanceAfterDecline(orderId, agentId);
    } catch (error: any) {
      this.logger.error(
        `Decline cascade failed for order ${orderId}: ${error.message}`,
      );
    }
  }
}
