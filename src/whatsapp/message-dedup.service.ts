import { Injectable } from '@nestjs/common';

/**
 * Prevents processing the same inbound WhatsApp message twice when Meta retries webhooks.
 */
@Injectable()
export class MessageDedupService {
  private readonly seen = new Map<string, number>();
  private readonly ttlMs = 10 * 60 * 1000;

  /** Returns true if this message should be processed (first time only). */
  consume(messageId: string): boolean {
    this.prune();
    if (this.seen.has(messageId)) {
      return false;
    }
    this.seen.set(messageId, Date.now());
    return true;
  }

  private prune(): void {
    const cutoff = Date.now() - this.ttlMs;
    for (const [id, ts] of this.seen) {
      if (ts < cutoff) {
        this.seen.delete(id);
      }
    }
  }
}
