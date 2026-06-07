import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { MessageReceivedEvent } from '@/whatsapp/events/message-received.event';
import { OrderStatus } from '@/common/enums/order-status.enum';
import { WhatsappService } from '@/whatsapp/whatsapp.service';
import { DispatchService } from '@/dispatch/dispatch.service';

/**
 * MatchingResponseListener
 * Listens for WhatsApp button replies from suppliers (Accept / Decline) during the cascade.
 * Uses row-level locking (FOR UPDATE) to guarantee exactly-once assignment.
 */
@Injectable()
export class MatchingResponseListener {
  private readonly logger = new Logger(MatchingResponseListener.name);

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly whatsappService: WhatsappService,
    private readonly dispatchService: DispatchService,
  ) {}

  @OnEvent('message.received')
  async handleSupplierResponse(event: MessageReceivedEvent): Promise<void> {
    const { from, content } = event;

    if (!content.buttonTitle) return;

    const buttonId = content.buttonTitle;

    if (buttonId.startsWith('accept_')) {
      const orderId = buttonId.replace('accept_', '');
      await this.handleAccept(from, orderId);
    } else if (buttonId.startsWith('decline_')) {
      const orderId = buttonId.replace('decline_', '');
      await this.handleDecline(from, orderId);
    }
  }

  private async handleAccept(
    agentPhone: string,
    orderId: string,
  ): Promise<void> {
    const [agentRow] = await this.dataSource.query(
      `SELECT id FROM agents WHERE phone = $1`,
      [agentPhone],
    );

    if (!agentRow) {
      this.logger.warn(
        `Accept received from unknown agent phone ${agentPhone}`,
      );
      return;
    }

    const agentId = agentRow.id;

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const [lockedOrder] = await queryRunner.query(
        `SELECT id, status, agent_id FROM orders WHERE id = $1 FOR UPDATE`,
        [orderId],
      );

      if (!lockedOrder) {
        await queryRunner.rollbackTransaction();
        await this.whatsappService.sendText(
          agentPhone,
          'This order no longer exists.',
        );
        return;
      }

      if (
        lockedOrder.status !== OrderStatus.SUPPLIER_ASSIGNED ||
        lockedOrder.agent_id !== null
      ) {
        await queryRunner.rollbackTransaction();
        await this.whatsappService.sendText(
          agentPhone,
          'Sorry — this request was already assigned to another supplier or expired.',
        );
        return;
      }

      // Claim the order
      await queryRunner.query(
        `UPDATE orders 
         SET agent_id = $1, status = $2, updated_at = NOW() 
         WHERE id = $3`,
        [agentId, OrderStatus.SUPPLIER_ACCEPTED, orderId],
      );

      await queryRunner.commitTransaction();

      this.logger.log(`Supplier ${agentId} accepted order ${orderId}`);

      // Fetch delivery location and amount for rich map link
      const [orderDetails] = await this.dataSource.query(
        `SELECT ST_AsText(delivery_location) as wkt, total_xaf FROM orders WHERE id = $1`,
        [orderId],
      );

      if (orderDetails?.wkt) {
        await this.dispatchService.sendAcceptanceConfirmationWithMap(
          agentPhone,
          orderId.slice(0, 8),
          orderDetails.wkt,
          parseInt(orderDetails.total_xaf, 10) || 0,
        );
      } else {
        await this.whatsappService.sendText(
          agentPhone,
          `✅ Assignment confirmed for Order #${orderId.slice(0, 8)}. Proceed to the delivery location.`,
        );
      }

      // Notify customer
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
          await this.whatsappService.sendText(
            customer.phone,
            `✅ A supplier has accepted your order and is on the way!`,
          );
        }
      }
    } catch (error: any) {
      await queryRunner.rollbackTransaction();
      this.logger.error(
        `Failed to claim order ${orderId} for supplier ${agentId}: ${error.message}`,
      );

      await this.whatsappService.sendText(
        agentPhone,
        'Assignment failed due to a technical error. Please try again later.',
      );
    } finally {
      await queryRunner.release();
    }
  }

  private async handleDecline(
    agentPhone: string,
    orderId: string,
  ): Promise<void> {
    const [agentRow] = await this.dataSource.query(
      `SELECT id FROM agents WHERE phone = $1`,
      [agentPhone],
    );

    if (!agentRow) return;

    const agentId = agentRow.id;

    // Check if order is still assigned to this agent
    const [order] = await this.dataSource.query(
      `SELECT status, agent_id FROM orders WHERE id = $1`,
      [orderId],
    );

    if (order?.status === OrderStatus.SUPPLIER_ASSIGNED && order?.agent_id === agentId) {
      // Advance immediately on decline
      await this.whatsappService.sendText(
        agentPhone,
        'Thank you. The request has been passed to the next supplier.',
      );
    }
  }
}