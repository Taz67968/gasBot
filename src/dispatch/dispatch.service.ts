import { Injectable, Logger } from '@nestjs/common';
import { WhatsappService } from '@/whatsapp/whatsapp.service';

/**
 * Rich dispatch payload sent to a driver when a new order is offered.
 */
export interface DispatchPayload {
  orderReference: string;
  gasType: string; // e.g. "12kg Standard Cylinder"
  sizeKg: number;
  amountXaf: number; // Cash to collect on delivery
  estimatedDistanceMeters?: number;
  customerArea?: string;
}

/**
 * DispatchService
 * Interactive communication service responsible for all driver-facing
 * conversational dispatch flows (assignment offers and acceptance confirmations).
 */
@Injectable()
export class DispatchService {
  private readonly logger = new Logger(DispatchService.name);

  constructor(private readonly whatsappService: WhatsappService) {}

  /**
   * Sends a rich, actionable assignment notification to a driver via WhatsApp.
   * Includes all critical operational details + clear Accept/Decline buttons.
   */
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
    } = payload;

    const distanceText = estimatedDistanceMeters
      ? `${(estimatedDistanceMeters / 1000).toFixed(1)} km`
      : 'calculating...';

    const bodyText = [
      `🚚 *New GasBot Assignment*`,
      ``,
      `📦 Order: *${orderReference}*`,
      `🛢️ Gas: *${gasType}* (${sizeKg}kg)`,
      `💰 Collect on delivery: *${amountXaf.toLocaleString()} XAF*`,
      `📍 Distance: *${distanceText}*`,
      customerArea ? `📌 Area: ${customerArea}` : '',
      ``,
      `Please respond quickly — assignment expires in 90 seconds.`,
    ]
      .filter(Boolean)
      .join('\n');

    try {
      await this.whatsappService.sendInteractiveButtons(agentPhone, bodyText, [
        { id: `accept_${orderId}`, title: 'Accept' },
        { id: `decline_${orderId}`, title: 'Decline' },
      ]);

      this.logger.log(
        `Rich dispatch offer sent to ${agentPhone} for order ${orderReference}`,
      );
    } catch (error: any) {
      this.logger.error(
        `Failed to send dispatch offer to ${agentPhone}: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Sent immediately after a driver successfully accepts an assignment.
   * Contains a direct Google Maps navigation link using the order's delivery coordinates.
   */
  async sendAcceptanceConfirmationWithMap(
    agentPhone: string,
    orderReference: string,
    deliveryLocationWkt: string, // e.g. "POINT(11.5021 3.8480)"
    amountXaf: number,
  ): Promise<void> {
    // Extract lat/lng from PostGIS WKT format "POINT(lng lat)"
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
      `Cash on delivery: *${amountXaf.toLocaleString()} XAF*`,
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
}
