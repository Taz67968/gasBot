import { Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { ConfigLoader } from '@/config/configuration';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private readonly client: Redis;

  constructor(private readonly config: ConfigLoader) {
    const url = this.config.redisUrl;

    this.client = new Redis(url, {
      lazyConnect: true,
      maxRetriesPerRequest: 0,
      enableReadyCheck: false,
      connectTimeout: 5000,
      commandTimeout: 5000,
      retryStrategy: (_times) => null,
      keepAlive: 5000,
      tls: url.startsWith('rediss://') ? {} : undefined,
    });

    this.client.on('error', (err) => {
      this.logger.warn(`Redis unavailable (non-fatal): ${err.message}`);
    });

    this.client.on('connect', () => {
      this.logger.log('Redis connection established');
    });

    this.client.on('ready', () => {
      this.logger.log('Redis connection ready');
    });
  }

  getClient(): Redis {
    return this.client;
  }

  async connect(): Promise<void> {
    if (this.client.status === 'ready') return;
    if (this.client.status === 'connecting') return;
    await this.client.connect();
  }

  async onModuleDestroy() {
    if (
      this.client.status === 'ready' ||
      this.client.status === 'connecting' ||
      this.client.status === 'wait' ||
      this.client.status === 'reconnecting'
    ) {
      await this.client.quit();
    }
  }
}
