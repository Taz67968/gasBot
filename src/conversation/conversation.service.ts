import { Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConversationState } from './enums/conversation-state.enum';
import { RedisService } from '@/redis/redis.service';

/**
 * Interface for the stored conversation session in Redis.
 */
export interface ConversationSession {
  state: ConversationState;
  language: string; // 'en' | 'fr' | etc.
  data: Record<string, any>; // Flexible payload: selectedProduct, location, etc.
  lastUpdated: string;
}

/**
 * ConversationService
 * Core session manager powered exclusively by Redis.
 * Uses per-user keys with 24h rolling TTL.
 * All state is ephemeral and isolated to Redis (no DB persistence for flow state).
 */
@Injectable()
export class ConversationService implements OnModuleDestroy {
  private readonly logger = new Logger(ConversationService.name);
  private readonly TTL_SECONDS = 24 * 60 * 60; // 24 hours absolute rolling TTL

  constructor(
    private readonly redisService: RedisService,
  ) {
    const redis = this.redisService.getClient();

    redis.on('error', (err) => {
      this.logger.error(
        `Redis connection error in ConversationService: ${err.message}`,
      );
    });

    redis.on('connect', () => {
      this.logger.log('Connected to Redis for conversation state management');
    });

    redis.on('ready', () => {
      this.logger.log('Connected to Redis for conversation state management');
    });
  }

  private getRedis() {
    return this.redisService.getClient();
  }

  private getKey(phoneNumber: string): string {
    return `conv:${phoneNumber}`;
  }

  /**
   * Fetches current session or initializes a new IDLE session.
   */
  async getSession(phoneNumber: string): Promise<ConversationSession> {
    const key = this.getKey(phoneNumber);
    const raw = await this.getRedis().get(key);

    if (raw) {
      const session: ConversationSession = JSON.parse(raw);
      await this.getRedis().expire(key, this.TTL_SECONDS);
      return session;
    }

    const initial: ConversationSession = {
      state: ConversationState.IDLE,
      language: 'en',
      data: {},
      lastUpdated: new Date().toISOString(),
    };

    await this.getRedis().setex(key, this.TTL_SECONDS, JSON.stringify(initial));
    return initial;
  }

  /**
   * Atomically updates state and optional data payload.
   * Always renews the 24h TTL (rolling window).
   */
  async setState(
    phoneNumber: string,
    state: ConversationState,
    data?: Partial<ConversationSession['data']>,
  ): Promise<ConversationSession> {
    const key = this.getKey(phoneNumber);
    const current = await this.getSession(phoneNumber);

    const updated: ConversationSession = {
      ...current,
      state,
      data: {
        ...current.data,
        ...(data || {}),
      },
      lastUpdated: new Date().toISOString(),
    };

    await this.getRedis().setex(key, this.TTL_SECONDS, JSON.stringify(updated));
    this.logger.debug(
      `Conversation state updated for ${phoneNumber} → ${state}`,
    );

    return updated;
  }

  /**
   * Updates only the language preference (used during LANGUAGE_SELECT).
   */
  async setLanguage(
    phoneNumber: string,
    language: string,
  ): Promise<ConversationSession> {
    const key = this.getKey(phoneNumber);
    const current = await this.getSession(phoneNumber);

    const updated: ConversationSession = {
      ...current,
      language,
      lastUpdated: new Date().toISOString(),
    };

    await this.getRedis().setex(key, this.TTL_SECONDS, JSON.stringify(updated));
    return updated;
  }

  /**
   * Clears the entire conversation session (e.g. after order completion or timeout handling).
   */
  async clearSession(phoneNumber: string): Promise<void> {
    const key = this.getKey(phoneNumber);
    await this.getRedis().del(key);
    this.logger.log(`Conversation session cleared for ${phoneNumber}`);
  }

  async onModuleDestroy() {
    await this.getRedis().quit();
  }
}
