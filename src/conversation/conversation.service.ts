import { Injectable, Logger } from '@nestjs/common';
import { ConversationState } from './enums/conversation-state.enum';

/**
 * Interface for the stored conversation session.
 */
export interface ConversationSession {
  state: ConversationState;
  language: string; // 'en' | 'fr' | etc.
  data: Record<string, any>; // Flexible payload: selectedProduct, location, etc.
  lastUpdated: string;
}

/**
 * ConversationService
 * Core session manager for the webhook conversation flow.
 * Uses an in-memory map so the webhook path does not depend on Redis at startup.
 */
@Injectable()
export class ConversationService {
  private readonly logger = new Logger(ConversationService.name);
  private readonly sessions = new Map<string, ConversationSession>();

  private getKey(phoneNumber: string): string {
    return phoneNumber.trim().toLowerCase();
  }

  /**
   * Fetches current session or initializes a new IDLE session.
   */
  async getSession(phoneNumber: string): Promise<ConversationSession> {
    const key = this.getKey(phoneNumber);
    const existing = this.sessions.get(key);

    if (existing) {
      return existing;
    }

    const initial: ConversationSession = {
      state: ConversationState.IDLE,
      language: 'en',
      data: {},
      lastUpdated: new Date().toISOString(),
    };

    this.sessions.set(key, initial);
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

    this.sessions.set(key, updated);
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

    this.sessions.set(key, updated);
    return updated;
  }

  /**
   * Clears the entire conversation session (e.g. after order completion or timeout handling).
   */
  async clearSession(phoneNumber: string): Promise<void> {
    const key = this.getKey(phoneNumber);
    this.sessions.delete(key);
    this.logger.log(`Conversation session cleared for ${phoneNumber}`);
  }
}
