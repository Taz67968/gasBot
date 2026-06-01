import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ConversationService } from './conversation.service';
import { ConversationProcessor } from './processors/conversation.processor';
import { CustomerModule } from '@/customer/customer.module';
import { WhatsappModule } from '@/whatsapp/whatsapp.module';
import { VisionModule } from '@/vision/vision.module';
import { MatchingModule } from '@/matching/matching.module';
import { OrderModule } from '@/order/order.module';

@Module({
  imports: [
    EventEmitterModule.forRoot(),
    CustomerModule,
    WhatsappModule,
    VisionModule,
    MatchingModule,
    OrderModule,
  ],
  providers: [ConversationService, ConversationProcessor],
  exports: [ConversationService, ConversationProcessor],
})
export class ConversationModule {}
