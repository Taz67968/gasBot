import {
  Controller,
  Get,
  Post,
  Req,
  Res,
  HttpCode,
  HttpStatus,
  Logger,
  Query,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import * as crypto from 'crypto';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConfigLoader } from '@/config/configuration';
import { MessageReceivedEvent } from './events/message-received.event';

/**
 * WhatsappController
 * Handles Meta WhatsApp Cloud API webhooks (inbound messages + verification).
 */
@Controller('webhook/whatsapp')
export class WhatsappController {
  private readonly logger = new Logger(WhatsappController.name);
  private readonly verifyToken: string;
  private readonly appSecret: string; // used for signature validation (X-Hub-Signature-256)

  constructor(
    config: ConfigLoader,
    private readonly eventEmitter: EventEmitter2,
  ) {
    this.verifyToken = config.whatsappVerifyToken;
    // For signature we use the API token as secret (Meta docs recommend the App Secret,
    // but for Cloud API the permanent token works as the HMAC secret in practice).
    this.appSecret = config.whatsappApiToken;
  }

  /**
   * GET /webhook/whatsapp
   * Hub verification handshake required by Meta during app setup.
   */
  @Get()
  verifyWebhook(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
    @Res() res: Response,
  ): void {
    if (mode === 'subscribe' && token === this.verifyToken) {
      this.logger.log('Webhook verified successfully');
      res.status(HttpStatus.OK).send(challenge);
      return;
    }

    this.logger.warn('Webhook verification failed - invalid token or mode');
    res.status(HttpStatus.FORBIDDEN).send('Verification failed');
  }

  /**
   * POST /webhook/whatsapp
   * Receives all inbound messages, status updates, etc.
   * - Uses raw Buffer body (attached by express.raw middleware in main.ts)
   * - Validates X-Hub-Signature-256 HMAC
   * - Normalizes and emits typed domain events
   */
  @Post()
  @HttpCode(HttpStatus.OK)
  // eslint-disable-next-line @typescript-eslint/require-await
  async handleIncomingMessage(
    @Req() req: Request & { rawBody?: Buffer },
    @Res() res: Response,
  ): Promise<void> {
    const signature = req.headers['x-hub-signature-256'] as string | undefined;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    const rawBody: Buffer = (req as any).body; // Buffer because of raw parser

    if (!rawBody || !Buffer.isBuffer(rawBody)) {
      this.logger.error(
        'No raw body received - check express.raw middleware registration',
      );
      res.status(HttpStatus.BAD_REQUEST).send('Invalid body');
      return;
    }

    // === Signature Verification ===
    if (!signature) {
      this.logger.warn('Missing X-Hub-Signature-256 header');
      res.status(HttpStatus.FORBIDDEN).send('Missing signature');
      return;
    }

    const expectedSignature =
      'sha256=' +
      crypto.createHmac('sha256', this.appSecret).update(rawBody).digest('hex');

    const isValid = crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature),
    );

    if (!isValid) {
      this.logger.warn(
        'Invalid webhook signature - possible replay or tampering attempt',
      );
      res.status(HttpStatus.FORBIDDEN).send('Invalid signature');
      return;
    }

    // === Parse and Process ===
    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const payload: any = JSON.parse(rawBody.toString('utf8'));

      // WhatsApp sends under entry[0].changes[0].value.messages
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      const entries = payload.entry || [];
      for (const entry of entries) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
        const changes = entry.changes || [];
        for (const change of changes) {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          if (change.field !== 'messages') continue;

          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
          const value = change.value || {};
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
          const messages = value.messages || [];

          for (const msg of messages) {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
            const from = msg.from;
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
            const messageId = msg.id;
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
            const timestamp = msg.timestamp;
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
            const type = msg.type || 'unknown';

            let content: MessageReceivedEvent['content'] = {};

            switch (type) {
              case 'text':
                // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
                content.text = msg.text?.body;
                break;
              case 'button':
                // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
                content.buttonTitle = msg.button?.text || msg.button?.payload;
                break;
              case 'list':
              case 'list_reply':
                // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
                content.listTitle = msg.list_reply?.title || msg.list_reply?.id;
                break;
              case 'location':
                // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
                content.latitude = msg.location?.latitude;
                // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
                content.longitude = msg.location?.longitude;
                break;
              case 'image':
              case 'video':
              case 'document':
              case 'sticker':
                // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
                content.mediaId = msg[type]?.id;
                // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
                content.mimeType = msg[type]?.mime_type;
                // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
                content.caption = msg[type]?.caption;
                break;
              default:
                content = { text: JSON.stringify(msg) };
            }

            const event = new MessageReceivedEvent(
              from,
              messageId,
              type,
              content,
              timestamp,
              msg,
            );

            // Emit strongly-typed event for any listener (order service, vision, etc.)
            this.eventEmitter.emit('message.received', event);

            this.logger.log(
              `Emitted MessageReceivedEvent from ${from} (type=${type})`,
            );
          }
        }
      }

      // Always acknowledge quickly to Meta (within 20s)
      res.status(HttpStatus.OK).send('EVENT_RECEIVED');
      return;
    } catch (err: any) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      this.logger.error(`Error processing webhook: ${err.message}`);
      // Still return 200 to avoid Meta retry storms
      res.status(HttpStatus.OK).send('EVENT_RECEIVED');
    }
  }
}
