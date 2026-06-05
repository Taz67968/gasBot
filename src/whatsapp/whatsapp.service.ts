import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import { ConfigLoader } from '@/config/configuration';

function formatE164(raw: string): string {
  const normalized = raw.trim().replace(/\s+/g, '');
  if (!normalized) {
    throw new Error(`Invalid phone number: ${raw}`);
  }

  const digits = normalized.startsWith('+')
    ? normalized.slice(1).replace(/\D/g, '')
    : normalized.replace(/\D/g, '');

  if (!digits) {
    throw new Error(`Invalid phone number: ${raw}`);
  }

  // Preserve already international numbers such as +237... or 237... as-is.
  if (digits.startsWith('0')) {
    return `234${digits.slice(1)}`;
  }

  if (digits.length > 10) {
    return digits;
  }

  return `234${digits}`;
}

/**
 * WhatsappService
 * High-level wrapper around WhatsApp Cloud API (Graph API) for outbound messaging.
 * All methods are fire-and-forget with proper error logging and retry-friendly design.
 */
@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);
  private readonly http: AxiosInstance;
  private readonly phoneNumberId: string;
  private readonly accessToken: string;

  constructor(config: ConfigLoader) {
    this.accessToken = config.whatsappApiToken;
    this.phoneNumberId = config.whatsappPhoneNumberId;

    this.http = axios.create({
      baseURL: 'https://graph.facebook.com/v21.0',
      timeout: 15000,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * Send a simple text message.
   */
  async sendText(to: string, text: string): Promise<void> {
    const formattedTo = formatE164(to);
    const payload = {
      messaging_product: 'whatsapp',
      to: formattedTo,
      type: 'text',
      text: { body: text },
    };
    console.log(
      `[${new Date().toISOString()}] WhatsApp SEND → POST /${this.phoneNumberId}/messages ::`,
      JSON.stringify(payload),
    );
    try {
      await this.http.post(`/${this.phoneNumberId}/messages`, payload);
      this.logger.log(`Bot reply to ${formattedTo}: ${text}`);
      console.log(
        `[${new Date().toISOString()}] WhatsApp SEND ✅ Text sent to ${formattedTo}`,
      );
    } catch (error: any) {
      this.logger.error(
        `Failed to send text to ${formattedTo}: ${error.response?.data?.error?.message || error.message}`,
      );
      console.log(
        `[${new Date().toISOString()}] WhatsApp SEND ❌ Failed to send text to ${formattedTo}: ${error.response?.data?.error?.message || error.message}`,
      );
      throw error;
    }
  }

  /**[Nest] 95  - 06/04/2026, 1:46:01 PM    WARN [WhatsappController] Invalid webhook signatur[Nest] 95  - 06/04/2026, 1:46:01 PM    WARN [WhatsappController] Invalid webhook signature - possible replay or tampering attempt
[2026-06-04T13:46:01.931Z] POST /webhook/whatsapp - 403 FORBIDDEN - Invalid signature
[2026-06-04T13:46:01.931Z] POST /webhook/whatsapp - 403 FORBIDDEN - Invalid signature
   * Send interactive buttons (max 3 choices, as per WhatsApp limit).
   */
  async sendInteractiveButtons(
    to: string,
    body: string,
    buttons: Array<{ id: string; title: string }>,
  ): Promise<void> {
    if (buttons.length > 3) {
      throw new Error('WhatsApp interactive buttons support maximum 3 options');
    }

    const formattedTo = formatE164(to);
    const interactive = {
      type: 'button',
      body: { text: body },
      action: {
        buttons: buttons.map((b) => ({
          type: 'reply',
          reply: { id: b.id, title: b.title },
        })),
      },
    };
    const payload = {
      messaging_product: 'whatsapp',
      to: formattedTo,
      type: 'interactive',
      interactive,
    };
    console.log(
      `[${new Date().toISOString()}] WhatsApp SEND → POST /${this.phoneNumberId}/messages ::`,
      JSON.stringify(payload),
    );
    try {
      await this.http.post(`/${this.phoneNumberId}/messages`, payload);
      this.logger.log(`Bot reply to ${formattedTo}: ${body}`);
      console.log(
        `[${new Date().toISOString()}] WhatsApp SEND ✅ Interactive buttons sent to ${formattedTo}`,
      );
    } catch (error: any) {
      this.logger.error(
        `Failed to send buttons to ${formattedTo}: ${error.response?.data?.error?.message || error.message}`,
      );
      console.log(
        `[${new Date().toISOString()}] WhatsApp SEND ❌ Failed to send buttons to ${formattedTo}: ${error.response?.data?.error?.message || error.message}`,
      );
      throw error;
    }
  }

  /**
   * Send an interactive list (rows/sections).
   */
  async sendInteractiveList(
    to: string,
    body: string,
    buttonText: string,
    sections: Array<{
      title?: string;
      rows: Array<{ id: string; title: string; description?: string }>;
    }>,
  ): Promise<void> {
    const formattedTo = formatE164(to);
    const interactive = {
      type: 'list',
      body: { text: body },
      action: {
        button: buttonText,
        sections,
      },
    };

    try {
      await this.http.post(`/${this.phoneNumberId}/messages`, {
        messaging_product: 'whatsapp',
        to: formattedTo,
        type: 'interactive',
        interactive,
      });
      this.logger.log(`Bot reply to ${formattedTo}: ${body}`);
    } catch (error: any) {
      this.logger.error(
        `Failed to send list to ${formattedTo}: ${error.response?.data?.error?.message || error.message}`,
      );
      throw error;
    }
  }

  /**
   * Send a location request prompt (user will share live or saved location).
   * WhatsApp supports this via interactive message with type "location_request".
   */
  async sendLocationRequest(to: string, body: string): Promise<void> {
    const formattedTo = formatE164(to);
    const interactive = {
      type: 'location_request_message',
      body: { text: body },
      action: {
        name: 'send_location',
      },
    };

    try {
      await this.http.post(`/${this.phoneNumberId}/messages`, {
        messaging_product: 'whatsapp',
        to: formattedTo,
        type: 'interactive',
        interactive,
      });
      this.logger.log(`Bot reply to ${formattedTo}: ${body}`);
    } catch (error: any) {
      this.logger.error(
        `Failed to send location request to ${formattedTo}: ${error.response?.data?.error?.message || error.message}`,
      );
      throw error;
    }
  }
}
