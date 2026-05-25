import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Payment } from '@/database/entities/payment.entity';
import { Order } from '@/database/entities/order.entity';
import { PaymentStatus } from '@/common/enums/payment-status.enum';
import { OrderStatus } from '@/common/enums/order-status.enum';
import { OrderDeliveredEvent } from './events/order-delivered.event';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Agent confirms physical cash collection for an order (Pay by Hand).
   * Fully transactional with row-level locking to prevent duplicate confirmations.
   */
  async confirmCashCollectionByAgent(
    orderId: string,
    agentId: string, // from authenticated JWT payload
  ): Promise<{ success: boolean; message: string }> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // === Strict locking to prevent race conditions / double taps ===
      const payment = await queryRunner.manager
        .createQueryBuilder(Payment, 'payment')
        .leftJoinAndSelect('payment.order', 'order')
        .where('payment.orderId = :orderId', { orderId })
        .setLock('pessimistic_write') // SELECT ... FOR UPDATE
        .getOne();

      if (!payment) {
        throw new NotFoundException(`Payment record for order ${orderId} not found`);
      }

      if (payment.status === PaymentStatus.PAID_BY_HAND) {
        throw new ConflictException('Payment has already been confirmed by an agent');
      }

      if (!payment.order) {
        throw new NotFoundException(`Related order ${orderId} not found`);
      }

      // Update Payment record
      payment.status = PaymentStatus.PAID_BY_HAND;
      payment.cashCollectedByAgentId = agentId;
      payment.agentConfirmedAt = new Date();

      // Update Order status to DELIVERED
      const order = payment.order;
      order.status = OrderStatus.DELIVERED;

      // Persist both in the same transaction
      await queryRunner.manager.save(Payment, payment);
      await queryRunner.manager.save(Order, order);

      await queryRunner.commitTransaction();

      // Emit domain event (outside transaction) for customer notification
      this.eventEmitter.emit(
        'order.delivered',
        new OrderDeliveredEvent(
          order.id,
          order.customer?.phone ?? 'unknown',
          agentId,
          payment.amountXaf,
          new Date(),
        ),
      );

      this.logger.log(
        `Cash collection confirmed for order ${orderId} by agent ${agentId}`,
      );

      return {
        success: true,
        message: 'Cash collection confirmed. Order marked as delivered.',
      };
    } catch (error: any) {
      await queryRunner.rollbackTransaction();
      this.logger.error(
        `Failed to confirm cash for order ${orderId}: ${error.message}`,
      );
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Highly optimized aggregation for admin settlement dashboard.
   * Groups all PAID_BY_HAND payments by agent and calculates totals.
   */
  async getAgentSettlementSummary(): Promise<
    Array<{
      agentId: string;
      agentName: string;
      totalDeliveriesCompleted: number;
      totalCashCollectedByHand: number;
      unsettledCashBalanceDue: number;
    }>
  > {
    const rawResults = await this.dataSource.query(`
      SELECT 
        a.id AS "agentId",
        a.full_name AS "agentName",
        COUNT(p.id) AS "totalDeliveriesCompleted",
        COALESCE(SUM(p.amount_xaf), 0) AS "totalCashCollectedByHand",
        COALESCE(SUM(p.amount_xaf), 0) AS "unsettledCashBalanceDue"
      FROM agents a
      LEFT JOIN payments p 
        ON p.cash_collected_by_agent_id = a.id 
        AND p.status = 'PAID_BY_HAND'
      GROUP BY a.id, a.full_name
      ORDER BY "totalCashCollectedByHand" DESC
    `);

    return rawResults.map((row: any) => ({
      agentId: row.agentId,
      agentName: row.agentName,
      totalDeliveriesCompleted: parseInt(row.totalDeliveriesCompleted, 10),
      totalCashCollectedByHand: parseInt(row.totalCashCollectedByHand, 10),
      unsettledCashBalanceDue: parseInt(row.unsettledCashBalanceDue, 10),
    }));
  }
}
