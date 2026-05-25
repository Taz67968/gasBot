import { Module } from '@nestjs/common';
import { DispatchService } from './dispatch.service';
import { WhatsappModule } from '@/whatsapp/whatsapp.module';

/**
 * DispatchModule
 * Central service for all rich conversational communications with drivers
 * (assignment offers, confirmations, navigation links).
 */
@Module({
  imports: [WhatsappModule],
  providers: [DispatchService],
  exports: [DispatchService],
})
export class DispatchModule {}
