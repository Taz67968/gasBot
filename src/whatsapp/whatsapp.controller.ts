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

interface WhatsappRequest extends Request {
  requestId?: string;
  rawBody?: Buffer;
}

import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConfigLoader } from '@/config/configuration';
import { MessageReceivedEvent } from './events/message-received.event';

@Controller('webhook/whatsapp')
export class WhatsappController {
  private readonly logger = new Logger(WhatsappController.name);
  private readonly verifyToken: string;

  constructor(
    config: ConfigLoader,
    private readonly eventEmitter: EventEmitter2,
  ) {
    this.verifyToken = config.whatsappVerifyToken;
  }

  @Get()
  verifyWebhook(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
    @Res() res: Response,
  ): void {
    const endpoint = 'GET /webhook/whatsapp';
    if (mode === 'subscribe' && token === this.verifyToken) {
      this.logger.log(`[${endpoint}] Webhook verified successfully`);
      console.log(
        `[${new Date().toISOString()}] ${endpoint} - 200 OK - Webhook verified`,
      );
      res.status(HttpStatus.OK).send(challenge);
      return;
    }

    this.logger.warn(
      `[${endpoint}] Webhook verification failed - invalid token or mode`,
    );
    console.log(
      `[${new Date().toISOString()}] ${endpoint} - 403 FORBIDDEN - Verification failed`,
    );
    res.status(HttpStatus.FORBIDDEN).send('Verification failed');
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  async handleIncomingMessage(
    @Req() req: WhatsappRequest,
    @Res() res: Response,
  ): Promise<void> {
    const requestId = req.requestId || 'unknown';
    const rawBody: Buffer | undefined = req.body;

    this.logger.log(
      `[${requestId}] Incoming WhatsApp webhook POST request received`,
    );

    if (!rawBody || !Buffer.isBuffer(rawBody)) {
      this.logger.error(
        `[${requestId}] No raw body received - check express.raw middleware registration`,
      );
      console.log(
        `[${new Date().toISOString()}] POST /webhook/whatsapp - 400 BAD REQUEST - No raw body`,
      );
      res.status(HttpStatus.BAD_REQUEST).send('Invalid body');
      return;
    }

    try {
      const payload: any = JSON.parse(rawBody.toString('utf8'));

      console.log(
        `[${new Date().toISOString()}] POST /webhook/whatsapp - PAYLOAD: ${JSON.stringify(payload).slice(0, 2000)}`,
      );

      const entries = payload.entry || [];
      let processedMessages = 0;
      for (const entry of entries) {
        const changes = entry.changes || [];
        for (const change of changes) {
          if (change.field !== 'messages') continue;

          const value = change.value || {};
          const messages = value.messages || [];

          for (const msg of messages) {
            const from = msg.from;
            const messageId = msg.id;
            const timestamp = msg.timestamp;
            const type = msg.type || 'unknown';

            let content: MessageReceivedEvent['content'] = {};

            switch (type) {
              case 'text':
                content.text = msg.text?.body;
                break;
              case 'button':
              case 'interactive':
                // Handle both button types - interactive contains button_reply
                content.buttonTitle =
                  msg.button?.text ||
                  msg.button?.payload ||
                  msg.interactive?.button_reply?.title ||
                  msg.interactive?.button_reply?.id;
                break;
              case 'list':
              case 'list_reply':
                content.listTitle = msg.list_reply?.title || msg.list_reply?.id;
                break;
              case 'location':
                content.latitude = msg.location?.latitude;
                content.longitude = msg.location?.longitude;
                break;
              case 'image':
              case 'video':
              case 'document':
              case 'sticker':
                content.mediaId = msg[type]?.id;
                content.mimeType = msg[type]?.mime_type;
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

            this.eventEmitter.emit('message.received', event);
            processedMessages++;
          }
        }
      }

      this.logger.log(
        `POST /webhook/whatsapp processed ${processedMessages} message(s) from ${entries.length} entry/entries`,
      );
      console.log(
        `[${new Date().toISOString()}] POST /webhook/whatsapp - 200 OK - Processed ${processedMessages} message(s)`,
      );

      res.status(HttpStatus.OK).send('EVENT_RECEIVED');
      return;
    } catch (err: any) {
      this.logger.error(`Error processing webhook: ${err.message}`);
      console.log(
        `[${new Date().toISOString()}] POST /webhook/whatsapp - 200 OK - Error processing: ${err.message}`,
      );
      res.status(HttpStatus.OK).send('EVENT_RECEIVED');
    }
  }
}
