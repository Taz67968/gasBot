import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { MessageReceivedEvent } from '@/whatsapp/events/message-received.event';
import { OrderStatus } from '@/common/enums/order-status.enum';
import { WhatsappService } from '@/whatsapp/whatsapp.service';
import { DispatchService } from '@/dispatch/dispatch.service';
import { MatchingService } from './matching.service';

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
    private readonly matchingService: MatchingService,
  ) {}

  @OnEvent('message.received')
  async handleSupplierResponse(event: MessageReceivedEvent): Promise<void> {
    const { from, content } = event;

    const buttonId = content.buttonId || content.buttonTitle;
    const text = (content.text || '').trim().toUpperCase();

    if (buttonId) {
      if (buttonId.startsWith('arrived_')) {
        const orderId = buttonId.replace('arrived_', '');
        await this.handleArrived(from, orderId);
        return;
      }

      if (
        buttonId.startsWith('accept_') ||
        buttonId.startsWith('direct_accept_')
      ) {
        const orderId = buttonId
          .replace('direct_accept_', '')
          .replace('accept_', '');
        await this.handleAccept(from, orderId);
        return;
      }

      if (
        buttonId.startsWith('decline_') ||
        buttonId.startsWith('direct_decline_')
      ) {
        const orderId = buttonId
          .replace('direct_decline_', '')
          .replace('decline_', '');
        await this.handleDecline(from, orderId);
        return;
      }
    }

    if (text === 'ACCEPT' || text === 'ACCEPTER') {
      await this.handleTextAccept(from, text, event);
      return;
    }

    if (text === 'DECLINE' || text === 'REFUSER') {
      await this.handleDecline(from, event);
      return;
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
        `SELECT id, status, agent_id, reference FROM orders WHERE id = $1 FOR UPDATE`,
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

      if (lockedOrder.agent_id !== null && lockedOrder.agent_id !== agentId) {
        await queryRunner.rollbackTransaction();
        await this.whatsappService.sendText(
          agentPhone,
          'Sorry — this request was already assigned to another supplier or expired.',
        );
        return;
      }

      const alreadySameAgent =
        lockedOrder.status === OrderStatus.EN_ROUTE &&
        lockedOrder.agent_id === agentId;
      if (alreadySameAgent) {
        await queryRunner.rollbackTransaction();
        await this.whatsappService.sendText(
          agentPhone,
          `You already accepted this order.`,
        );
        return;
      }

      const nextStatus =
        lockedOrder.status === OrderStatus.WAITING_FOR_SUPPLIER
          ? OrderStatus.SUPPLIER_ASSIGNED
          : OrderStatus.EN_ROUTE;

      await queryRunner.query(
        `UPDATE orders 
         SET agent_id = $1, status = $2, updated_at = NOW() 
         WHERE id = $3`,
        [agentId, nextStatus, orderId],
      );

      await queryRunner.commitTransaction();

      this.logger.log(`Supplier ${agentId} accepted order ${orderId}`);

      const [orderDetails] = await this.dataSource.query(
        `SELECT ST_AsText(delivery_location) as wkt, total_xaf, reference, delivery_address_text
         FROM orders WHERE id = $1`,
        [orderId],
      );

      const orderReference = orderDetails?.reference || orderId.slice(0, 8);

      if (orderDetails?.wkt) {
        await this.dispatchService.sendAcceptanceConfirmationWithMap(
          agentPhone,
          orderReference,
          orderDetails.wkt,
          parseInt(orderDetails.total_xaf, 10) || 0,
        );
      } else if (orderDetails?.delivery_address_text) {
        await this.whatsappService.sendText(
          agentPhone,
          [
            `✅ Assignment *${orderReference}* accepted.`,
            `📌 Deliver to: ${orderDetails.delivery_address_text}`,
            `💰 Cash to collect: ${parseInt(orderDetails.total_xaf, 10) || 0} XAF`,
          ].join('\n'),
        );
      } else {
        await this.whatsappService.sendText(
          agentPhone,
          `✅ Assignment confirmed for Order *${orderReference}*. Proceed to the delivery location.`,
        );
      }

      await this.dispatchService.sendEnRouteArrivedButton(
        agentPhone,
        orderReference,
        orderId,
      );

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

  private async handleTextAccept(
    agentPhone: string,
    _text: string,
    event: MessageReceivedEvent,
  ): Promise<void> {
    const contextWord = event.content.text || '';
    const orderId = contextWord.match(/[A-F0-9-]{8,}/i)?.[0] || '';

    if (!orderId) {
      await this.whatsappService.sendText(
        agentPhone,
        'Please share the order code or use the Accept button from the notification.',
      );
      return;
    }

    await this.handleAccept(agentPhone, orderId);
  }

  private async handleArrived(
    agentPhone: string,
    orderId: string,
  ): Promise<void> {
    const [order] = await this.dataSource.query(
      `SELECT o.id, o.reference, o.customer_id, o.agent_id, c.phone as customer_phone
       FROM orders o
       JOIN customers c ON c.id = o.customer_id
       WHERE o.id = $1
       LIMIT 1`,
      [orderId],
    );

    if (!order) {
      await this.whatsappService.sendText(
        agentPhone,
        'Order not found. Please contact support.',
      );
      return;
    }

    const [agentRow] = await this.dataSource.query(
      `SELECT id FROM agents WHERE phone = $1`,
      [agentPhone],
    );

    if (!agentRow || order.agent_id !== agentRow.id) {
      await this.whatsappService.sendText(
        agentPhone,
        'You are not assigned to this order.',
      );
      return;
    }

    await this.dataSource.query(
      `UPDATE orders SET status = $1, updated_at = NOW() WHERE id = $2`,
      [OrderStatus.NEARBY, orderId],
    );

    await this.dispatchService.sendArrivalCustomerContact(
      agentPhone,
      order.reference,
      order.customer_phone,
    );

    await this.whatsappService.sendText(
      order.customer_phone,
      `✅ Your supplier has arrived for order ${order.reference}. Please look for them.`,
    );
  }

  private async handleDecline(
    agentPhone: string,
    eventOrOrderId: MessageReceivedEvent | string,
  ): Promise<void> {
    const orderId =
      typeof eventOrOrderId === 'string'
        ? eventOrOrderId
        : (eventOrOrderId.content.text || '').match(/[A-F0-9-]{8,}/i)?.[0] ||
          '';

    if (!orderId) {
      return;
    }

    const [agentRow] = await this.dataSource.query(
      `SELECT id FROM agents WHERE phone = $1`,
      [agentPhone],
    );

    if (!agentRow) return;

    const agentId = agentRow.id;

    const [order] = await this.dataSource.query(
      `SELECT id, status, agent_id FROM orders WHERE id = $1`,
      [orderId],
    );

    if (!order || order.agent_id) {
      return;
    }

    await this.whatsappService.sendText(
      agentPhone,
      'Thank you. The request has been passed to the next supplier.',
    );

    await this.matchingService.handleSupplierDecline(orderId, agentId);
  }
}
