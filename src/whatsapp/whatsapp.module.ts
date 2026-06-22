import { Module } from '@nestjs/common';
import { WhatsappController } from './whatsapp.controller';
import { WhatsappService } from './whatsapp.service';
import { MessageDedupService } from './message-dedup.service';

/**
 * WhatsappModule
 * Encapsulates all WhatsApp Cloud API inbound (webhook) and outbound (messaging) concerns.
 * Emits domain events via EventEmitter2 for loose coupling with business logic (e.g. VisionModule, OrderModule).
 */
@Module({
  imports: [],
  controllers: [WhatsappController],
  providers: [WhatsappService, MessageDedupService],
  exports: [WhatsappService, MessageDedupService],
})
export class WhatsappModule {}
