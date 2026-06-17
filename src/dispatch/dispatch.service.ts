import { Injectable, Logger } from '@nestjs/common';
import { WhatsappService } from '@/whatsapp/whatsapp.service';

export interface DispatchPayload {
  orderReference: string;
  gasType: string;
  sizeKg: number;
  amountXaf: number;
  estimatedDistanceMeters?: number;
  customerArea?: string;
  bottleImageMediaId?: string;
  deliveryLat?: number;
  deliveryLng?: number;
  customerPhone?: string;
  orderId?: string;
}

@Injectable()
export class DispatchService {
  private readonly logger = new Logger(DispatchService.name);

  constructor(private readonly whatsappService: WhatsappService) {}

  async sendAssignmentOffer(
    agentPhone: string,
    payload: DispatchPayload,
    orderId: string,
  ): Promise<void> {
    const {
      orderReference,
      gasType,
      sizeKg,
      amountXaf,
      estimatedDistanceMeters,
      customerArea,
      bottleImageMediaId,
      deliveryLat,
      deliveryLng,
    } = payload;

    const distanceText = estimatedDistanceMeters
      ? `${(estimatedDistanceMeters / 1000).toFixed(1)} km away`
      : 'distance not available';

    const headerText = [
      `🚚 *New Gas Request*`,
      ``,
      `📦 Order: *${orderReference}*`,
      `🛢️ Gas: *${gasType}* (${sizeKg}kg)`,
      `💰 Total: *${amountXaf.toLocaleString()} XAF* (includes delivery fee)`,
      `📍 Distance: *${distanceText}*`,
      customerArea ? `📌 Area: ${customerArea}` : '',
      ``,
      `Tap *Accept* to take this order or *Decline* to pass.`,
    ]
      .filter(Boolean)
      .join('\n');

    try {
      if (bottleImageMediaId) {
        await this.whatsappService.sendText(
          agentPhone,
          headerText + `\n🖼️ Bottle image: ${bottleImageMediaId}`,
        );
      } else {
        await this.whatsappService.sendText(agentPhone, headerText);
      }

      if (deliveryLat && deliveryLng) {
        const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${deliveryLat},${deliveryLng}`;
        await this.whatsappService.sendText(
          agentPhone,
          `🗺️ *Live location:*\n${mapsUrl}`,
        );
      }

      await this.whatsappService.sendInteractiveButtons(
        agentPhone,
        'Confirm action',
        [
          { id: `accept_${orderId}`, title: 'Accept' },
          { id: `decline_${orderId}`, title: 'Decline' },
        ],
      );

      this.logger.log(
        `Supplier notification sent to ${agentPhone} for order ${orderReference}`,
      );
    } catch (error: any) {
      this.logger.error(
        `Failed to send dispatch offer to ${agentPhone}: ${error.message}`,
      );
      throw error;
    }
  }

  async sendAssignmentArrived(
    agentPhone: string,
    orderReference: string,
    customerPhone?: string,
  ): Promise<void> {
    const phoneLine = customerPhone ? `\n👤 Customer: ${customerPhone}` : '';
    await this.whatsappService.sendInteractiveButtons(
      agentPhone,
      `🚚 You have arrived at the delivery location for order *${orderReference}*.${phoneLine}`,
      [
        { id: `arrived_${orderReference}`, title: "I've arrived" },
        { id: `issue_${orderReference}`, title: 'Report issue' },
      ],
    );
  }

  async sendAcceptanceConfirmationWithMap(
    agentPhone: string,
    orderReference: string,
    deliveryLocationWkt: string,
    amountXaf: number,
  ): Promise<void> {
    const match = deliveryLocationWkt.match(/POINT\(([^ ]+) ([^)]+)\)/);
    if (!match) {
      this.logger.warn(
        `Invalid WKT for order ${orderReference} — sending text only`,
      );
      await this.whatsappService.sendText(
        agentPhone,
        `✅ Assignment *${orderReference}* accepted.\nCash to collect: ${amountXaf} XAF`,
      );
      return;
    }

    const lng = match[1];
    const lat = match[2];

    const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;

    const message = [
      `✅ *Assignment Confirmed*`,
      ``,
      `Order: *${orderReference}*`,
      `💰 Cash on delivery: *${amountXaf.toLocaleString()} XAF*`,
      ``,
      `🗺️ *Navigate to customer:*`,
      mapsUrl,
      ``,
      `Drive safely!`,
    ].join('\n');

    try {
      await this.whatsappService.sendText(agentPhone, message);
      this.logger.log(
        `Map link sent to ${agentPhone} for accepted order ${orderReference}`,
      );
    } catch (error: any) {
      this.logger.error(
        `Failed to send map link to ${agentPhone}: ${error.message}`,
      );
    }
  }

  async sendDeclineTimeout(
    phone: string,
    orderReference: string,
  ): Promise<void> {
    await this.whatsappService.sendText(
      phone,
      `⏰ You took too long to respond for order ${orderReference}. The request has been passed to another supplier.`,
    );
  }

  async sendNoSuppliersAvailable(
    phone: string,
    orderReference: string,
  ): Promise<void> {
    await this.whatsappService.sendText(
      phone,
      `⚠️ No suppliers found for order ${orderReference}. We'll notify you when one becomes available.`,
    );
  }
}
