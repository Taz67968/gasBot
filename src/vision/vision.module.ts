import { Module } from '@nestjs/common';
import { VisionService } from './vision.service';

/**
 * VisionModule
 * Provides GPT-4o powered image analysis for gas cylinders received through WhatsApp.
 * Can be injected into any service that receives media references (e.g. via MessageReceivedEvent).
 */
@Module({
  providers: [VisionService],
  exports: [VisionService],
})
export class VisionModule {}
