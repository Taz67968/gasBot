import { Injectable, Logger } from '@nestjs/common';
import { WhatsappService } from '@/whatsapp/whatsapp.service';

export interface DispatchPayload {
  orderReference: string;
  gasType: string;
  sizeKg: number;
  amountXaf: number;
  estimatedDistanceMeters?: number;
  customerArea?: string;
  manualAddress?: string;
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
      manualAddress,
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
      ``,
      `Review the bottle image and delivery location below, then tap *Accept* or *Decline*.`,
    ].join('\n');

    try {
      if (bottleImageMediaId) {
        try {
          await this.whatsappService.sendImage(
            agentPhone,
            bottleImageMediaId,
            '🛢️ Customer bottle photo',
          );
        } catch (imageError: any) {
          this.logger.warn(
            `Could not send bottle image for order ${orderReference}: ${imageError.message}`,
          );
          await this.whatsappService.sendText(
            agentPhone,
            `🖼️ Bottle image attached to this order (media unavailable to resend).`,
          );
        }
      }

      await this.whatsappService.sendText(agentPhone, headerText);

      if (manualAddress) {
        await this.whatsappService.sendText(
          agentPhone,
          `📌 *Customer address:*\n${manualAddress}`,
        );
      }

      if (deliveryLat !== undefined && deliveryLng !== undefined) {
        try {
          await this.whatsappService.sendLocation(
            agentPhone,
            deliveryLat,
            deliveryLng,
            'Customer live location',
            manualAddress,
          );
        } catch (locationError: any) {
          this.logger.warn(
            `Could not send location pin for order ${orderReference}: ${locationError.message}`,
          );
        }

        const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${deliveryLat},${deliveryLng}`;
        await this.whatsappService.sendText(
          agentPhone,
          `📍 *Navigate to customer:*\n${mapsUrl}`,
        );
      } else if (!manualAddress) {
        await this.whatsappService.sendText(
          agentPhone,
          `📍 *Delivery location:* Customer location not available yet.`,
        );
      }

      await this.whatsappService.sendInteractiveButtons(
        agentPhone,
        'Take this delivery?',
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

  async sendEnRouteArrivedButton(
    agentPhone: string,
    orderReference: string,
    orderId: string,
  ): Promise<void> {
    await this.whatsappService.sendInteractiveButtons(
      agentPhone,
      `🚗 You are on the way for order *${orderReference}*.\n\nTap below when you reach the customer location.`,
      [{ id: `arrived_${orderId}`, title: "I've arrived" }],
    );
  }

  async sendArrivalCustomerContact(
    agentPhone: string,
    orderReference: string,
    customerPhone: string,
  ): Promise<void> {
    await this.whatsappService.sendText(
      agentPhone,
      [
        `✅ *Arrival confirmed* for order *${orderReference}*`,
        ``,
        `📞 *Customer phone:* ${customerPhone}`,
        `Call or text the customer to let them know you have arrived.`,
      ].join('\n'),
    );
  }

  async sendAcceptanceConfirmationWithMap(
    agentPhone: string,
    orderReference: string,
    deliveryLocationWkt: string,
    amountXaf: number,
    manualAddress?: string,
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

    const lng = parseFloat(match[1]);
    const lat = parseFloat(match[2]);
    const hasGps = lat !== 0 || lng !== 0;

    const message = [
      `✅ *Assignment Confirmed*`,
      ``,
      `Order: *${orderReference}*`,
      `💰 Cash on delivery: *${amountXaf.toLocaleString()} XAF*`,
      manualAddress ? `📌 Address: ${manualAddress}` : '',
      ``,
      hasGps ? `Open the location pin below to navigate.` : `Proceed to the delivery address.`,
    ]
      .filter(Boolean)
      .join('\n');

    try {
      await this.whatsappService.sendText(agentPhone, message);

      if (hasGps) {
        try {
          await this.whatsappService.sendLocation(
            agentPhone,
            lat,
            lng,
            'Customer delivery location',
            manualAddress,
          );
        } catch (locationError: any) {
          this.logger.warn(
            `Could not send navigation pin for order ${orderReference}: ${locationError.message}`,
          );
        }

        const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
        await this.whatsappService.sendText(
          agentPhone,
          `🗺️ *Google Maps:*\n${mapsUrl}`,
        );
      }

      this.logger.log(
        `Navigation sent to ${agentPhone} for accepted order ${orderReference}`,
      );
    } catch (error: any) {
      this.logger.error(
        `Failed to send navigation to ${agentPhone}: ${error.message}`,
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
