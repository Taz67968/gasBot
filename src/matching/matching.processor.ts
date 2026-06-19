import {
  Processor,
  WorkerHost,
  OnWorkerEvent,
} from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Injectable, Logger } from '@nestjs/common';
import {
  StartCascadeJob,
  TimeoutCascadeJob,
  DeclineCascadeJob,
} from './interfaces/matching-job.interface';
import { MatchingCascadeService } from './matching-cascade.service';

@Processor('driver-matching')
@Injectable()
export class MatchingProcessor extends WorkerHost {
  private readonly logger = new Logger(MatchingProcessor.name);

  constructor(private readonly cascadeService: MatchingCascadeService) {
    super();
  }

  async process(
    job: Job<StartCascadeJob | TimeoutCascadeJob | DeclineCascadeJob, any, string>,
  ): Promise<any> {
    if (job.name === 'START_CASCADE') {
      return this.cascadeService.beginCascade(
        (job.data as StartCascadeJob).orderId,
      );
    }

    if (job.name === 'TIMEOUT_CASCADE') {
      const data = job.data as TimeoutCascadeJob;
      return this.cascadeService.advanceAfterTimeout(
        data.orderId,
        data.agentId,
        data.attemptIndex,
      );
    }

    if (job.name === 'DECLINE_CASCADE') {
      const data = job.data as DeclineCascadeJob;
      return this.cascadeService.advanceAfterDecline(data.orderId, data.agentId);
    }

    throw new Error(`Unknown job type: ${job.name}`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, error: Error) {
    this.logger.error(`Matching job ${job.id} failed: ${error.message}`);
  }
}
