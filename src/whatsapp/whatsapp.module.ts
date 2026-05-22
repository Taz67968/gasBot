import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { WhatsappController } from './whatsapp.controller';
import { WhatsappService } from './whatsapp.service';

/**
 * WhatsappModule
 * Encapsulates all WhatsApp Cloud API inbound (webhook) and outbound (messaging) concerns.
 * Emits domain events via EventEmitter2 for loose coupling with business logic (e.g. VisionModule, OrderModule).
 */
@Module({
  imports: [
    // Event emitter is also registered globally in AppModule, but safe to import here too
    EventEmitterModule.forRoot(),
  ],
  controllers: [WhatsappController],
  providers: [WhatsappService],
  exports: [WhatsappService],
})
export class WhatsappModule {}
