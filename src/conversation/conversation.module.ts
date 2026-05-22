import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ConversationService } from './conversation.service';
import { ConversationProcessor } from './processors/conversation.processor';
import { CustomerModule } from '@/customer/customer.module';
import { WhatsappModule } from '@/whatsapp/whatsapp.module';
import { VisionModule } from '@/vision/vision.module';

/**
 * ConversationModule
 * Wires the Redis-backed conversational state machine and its central processor.
 */
@Module({
  imports: [
    EventEmitterModule.forRoot(), // safe to re-import
    CustomerModule,
    WhatsappModule,
    VisionModule,
  ],
  providers: [ConversationService, ConversationProcessor],
  exports: [ConversationService, ConversationProcessor],
})
export class ConversationModule {}
