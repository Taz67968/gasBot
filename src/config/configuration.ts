import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EnvConfig } from './env.validation';

/**
 * Enterprise Configuration Loader Class
 *
 * This is the single source of truth for all runtime configuration in GasBot.
 * It provides fully typed, validated access to environment variables via
 * NestJS ConfigService, eliminating magic strings and runtime surprises.
 *
 * Usage anywhere (services, modules, guards):
 *   constructor(private readonly config: ConfigLoader) {}
 *   const host = this.config.dbHost;
 *
 * Because validation runs at bootstrap (see env.validation.ts), every getter
 * is guaranteed to return a non-null, correctly typed value.
 */
@Injectable()
export class ConfigLoader {
  constructor(private readonly configService: ConfigService<EnvConfig>) {}

  // ---------------------------------------------------------------------------
  // Database (PostGIS)
  // ---------------------------------------------------------------------------

  /** PostgreSQL / PostGIS host (service name inside Docker or IP/hostname) */
  get dbHost(): string {
    return this.configService.getOrThrow<string>('DB_HOST');
  }

  /** PostgreSQL port (defaults to 5432 in schema) */
  get dbPort(): number {
    return this.configService.getOrThrow<number>('DB_PORT');
  }

  /** Database username */
  get dbUsername(): string {
    return this.configService.getOrThrow<string>('DB_USERNAME');
  }

  /** Database password (never logged) */
  get dbPassword(): string {
    return this.configService.getOrThrow<string>('DB_PASSWORD');
  }

  /** Target database name */
  get dbName(): string {
    return this.configService.getOrThrow<string>('DB_NAME');
  }

  /** Convenience getter returning full TypeORM / Prisma connection options */
  get databaseConfig() {
    return {
      host: this.dbHost,
      port: this.dbPort,
      username: this.dbUsername,
      password: this.dbPassword,
      database: this.dbName,
    };
  }

  // ---------------------------------------------------------------------------
  // Redis
  // ---------------------------------------------------------------------------

  /** Full Redis connection string (supports redis:// or rediss://) */
  get redisUrl(): string {
    return this.configService.getOrThrow<string>('REDIS_URL');
  }

  // ---------------------------------------------------------------------------
  // Security & Auth
  // ---------------------------------------------------------------------------

  /** JWT signing secret (minimum 32 chars enforced at boot) */
  get jwtSecret(): string {
    return this.configService.getOrThrow<string>('JWT_SECRET');
  }

  // ---------------------------------------------------------------------------
  // WhatsApp Business API (Meta)
  // ---------------------------------------------------------------------------

  /** Permanent access token for WhatsApp Cloud API calls */
  get whatsappApiToken(): string {
    return this.configService.getOrThrow<string>('WHATSAPP_API_TOKEN');
  }

  /** Webhook verification token used during Meta subscription handshake */
  get whatsappVerifyToken(): string {
    return this.configService.getOrThrow<string>('WHATSAPP_VERIFY_TOKEN');
  }

  /** Phone Number ID (sender) for outbound WhatsApp messages */
  get whatsappPhoneNumberId(): string {
    return this.configService.getOrThrow<string>('WHATSAPP_PHONE_NUMBER_ID');
  }

  // ---------------------------------------------------------------------------
  // OpenAI / LLM
  // ---------------------------------------------------------------------------

  /** OpenAI API key for GPT / embedding / assistant features */
  get openaiApiKey(): string {
    return this.configService.getOrThrow<string>('OPENAI_API_KEY');
  }

  // ---------------------------------------------------------------------------
  // General runtime
  // ---------------------------------------------------------------------------

  /** Current runtime environment (development | production | test) */
  get nodeEnv(): 'development' | 'production' | 'test' {
    return (
      this.configService.get<'development' | 'production' | 'test'>(
        'NODE_ENV',
      ) ?? 'development'
    );
  }

  /** HTTP server listen port */
  get port(): number {
    return this.configService.getOrThrow<number>('PORT');
  }

  /** Returns true when running in production (used for feature flags, logging, etc.) */
  get isProduction(): boolean {
    return this.nodeEnv === 'production';
  }

  /**
   * Dumps a safe (secret-masked) snapshot of configuration.
   * Useful for startup logging and health endpoints.
   */
  get safeConfigSnapshot(): Record<string, unknown> {
    return {
      nodeEnv: this.nodeEnv,
      port: this.port,
      dbHost: this.dbHost,
      dbPort: this.dbPort,
      dbName: this.dbName,
      dbUsername: this.dbUsername,
      redisUrl: this.redisUrl.replace(/:[^:]*@/, ':***@'), // mask password if present
      jwtSecret: '***REDACTED***',
      whatsappApiToken: '***REDACTED***',
      whatsappVerifyToken: '***REDACTED***',
      whatsappPhoneNumberId: this.whatsappPhoneNumberId,
      openaiApiKey: '***REDACTED***',
    };
  }
}
