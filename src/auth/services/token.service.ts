import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigLoader } from '@/config/configuration';
import {
  JwtPayload,
  ActiveTokenSession,
} from '../interfaces/jwt-payload.interface';
import { RedisService } from '@/redis/redis.service';

@Injectable()
export class TokenService implements OnModuleDestroy {
  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigLoader,
    private readonly redisService: RedisService,
  ) {
    const redis = this.redisService.getClient();

    redis.on('error', (err) => {
      console.error('[TokenService] Redis connection error:', err);
    });

    redis.on('connect', () => {
      console.log(
        '[TokenService] Connected to Redis for token session management',
      );
    });
  }

  private getRedis() {
    return this.redisService.getClient();
  }

  async generateAccessToken(
    payload: Omit<JwtPayload, 'iat' | 'exp' | 'jti'>,
  ): Promise<string> {
    const jti = this.generateJti();
    const now = Math.floor(Date.now() / 1000);
    const expiresIn = 3600 * 8;
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

    const sessionKey = this.getSessionKey(payload.sub, jti);
    const sessionProfile: ActiveTokenSession = {
      tokenId: jti,
      userId: payload.sub,
      phone: payload.phone,
      role: payload.role,
      issuedAt: new Date(now * 1000),
      expiresAt: new Date(exp * 1000),
    };

    await this.getRedis().setex(
      sessionKey,
      expiresIn,
      JSON.stringify(sessionProfile),
    );

    return token;
  }

  async isTokenActive(userId: string, jti?: string): Promise<boolean> {
    if (!jti) return false;

    const sessionKey = this.getSessionKey(userId, jti);
    const exists = await this.getRedis().exists(sessionKey);
    return exists === 1;
  }

  async logActiveSessionProfile(payload: JwtPayload): Promise<void> {
    if (!payload.jti) {
      return;
    }
    const sessionKey = this.getSessionKey(payload.sub, payload.jti);
    const raw = await this.getRedis().get(sessionKey);

    if (raw) {
      const profile: ActiveTokenSession = JSON.parse(raw as string) as ActiveTokenSession;
      profile.lastUsedAt = new Date();

      const ttl = await this.getRedis().ttl(sessionKey);
      if (ttl > 0) {
        await this.getRedis().setex(sessionKey, ttl, JSON.stringify(profile));
      }

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

  async revokeToken(userId: string, jti: string): Promise<void> {
    const sessionKey = this.getSessionKey(userId, jti);
    await this.getRedis().del(sessionKey);
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
    await this.getRedis().quit();
  }
}
