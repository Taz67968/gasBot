import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigLoader } from '@/config/configuration';
import Redis from 'ioredis';
import {
  JwtPayload,
  ActiveTokenSession,
} from '../interfaces/jwt-payload.interface';

/**
 * TokenService
 * Central engine for JWT access token lifecycle and Redis-backed session state.
 *
 * Features:
 * - HS256 signed access tokens with configurable expiration
 * - Redis storage of active sessions keyed by userId:jti
 * - Absolute expiration enforcement via Redis TTL
 * - Detailed logging of every validated active token profile
 * - Support for future refresh tokens / revocation lists
 */
@Injectable()
export class TokenService implements OnModuleDestroy {
  private readonly redis: Redis;

  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigLoader,
  ) {
    // Connect to Redis using the validated REDIS_URL from environment
    this.redis = new Redis(this.config.redisUrl, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      lazyConnect: true,
    });

    this.redis.on('error', (err) => {
      console.error('[TokenService] Redis connection error:', err);
    });

    this.redis.on('connect', () => {
      console.log(
        '[TokenService] Connected to Redis for token session management',
      );
    });
  }

  /**
   * Generate a signed JWT access token for a principal (agent or admin).
   * Stores the session profile in Redis with exact TTL matching token expiration.
   */
  async generateAccessToken(
    payload: Omit<JwtPayload, 'iat' | 'exp' | 'jti'>,
  ): Promise<string> {
    const jti = this.generateJti();
    const now = Math.floor(Date.now() / 1000);
    const expiresIn = 3600 * 8; // 8 hours - production tunable via config
    const exp = now + expiresIn;

    const fullPayload: JwtPayload = {
      ...payload,
      jti,
      iat: now,
      exp,
    };

    const token = await this.jwtService.signAsync(fullPayload, {
      secret: this.config.jwtSecret,
      expiresIn: `${expiresIn}s`,
    });

    // Persist active session in Redis with absolute expiration
    const sessionKey = this.getSessionKey(payload.sub, jti);
    const sessionProfile: ActiveTokenSession = {
      tokenId: jti,
      userId: payload.sub,
      phone: payload.phone,
      role: payload.role,
      issuedAt: new Date(now * 1000),
      expiresAt: new Date(exp * 1000),
    };

    // Store as JSON with TTL (Redis will auto-evict after absolute expiration)
    await this.redis.setex(
      sessionKey,
      expiresIn,
      JSON.stringify(sessionProfile),
    );

    return token;
  }

  /**
   * Check if a specific token (identified by user + jti) is still active in Redis.
   * Returns false for revoked or naturally expired tokens.
   */
  async isTokenActive(userId: string, jti?: string): Promise<boolean> {
    if (!jti) return false;

    const sessionKey = this.getSessionKey(userId, jti);
    const exists = await this.redis.exists(sessionKey);
    return exists === 1;
  }

  /**
   * Log a fully validated active token session profile.
   * In production this would go to structured logger (pino/winston) + metrics.
   * Includes absolute expiration for audit trails.
   */
  async logActiveSessionProfile(payload: JwtPayload): Promise<void> {
    if (!payload.jti) {
      return; // cannot log session without jti
    }
    const sessionKey = this.getSessionKey(payload.sub, payload.jti);
    const raw = await this.redis.get(sessionKey);

    if (raw) {
      const profile: ActiveTokenSession = JSON.parse(raw) as ActiveTokenSession;
      profile.lastUsedAt = new Date();

      // Re-save with updated lastUsedAt (keep original TTL)
      const ttl = await this.redis.ttl(sessionKey);
      if (ttl > 0) {
        await this.redis.setex(sessionKey, ttl, JSON.stringify(profile));
      }

      // Structured log (replace with proper logger in real system)
      console.log('[TokenService] Active JWT session validated', {
        userId: profile.userId,
        phone: profile.phone,
        role: profile.role,
        jti: profile.tokenId,
        issuedAt: profile.issuedAt,
        expiresAt: profile.expiresAt,
        lastUsedAt: profile.lastUsedAt,
        remainingSeconds: ttl,
      });
    }
  }

  /**
   * Revoke a specific token (logout / security incident).
   * Deletes from Redis immediately.
   */
  async revokeToken(userId: string, jti: string): Promise<void> {
    const sessionKey = this.getSessionKey(userId, jti);
    await this.redis.del(sessionKey);
    console.log(`[TokenService] Token revoked for user ${userId} jti ${jti}`);
  }

  private getSessionKey(userId: string, jti?: string): string {
    if (!jti) return `gasbot:auth:session:${userId}:unknown`;
    return `gasbot:auth:session:${userId}:${jti}`;
  }

  private generateJti(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
  }

  async onModuleDestroy() {
    await this.redis.quit();
  }
}
