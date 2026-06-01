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
      maxRetriesPerRequest: 10,
      enableReadyCheck: true,
      connectTimeout: 15000,
      commandTimeout: 10000,
      retryStrategy: (times) => Math.min(times * 300, 5000),
      keepAlive: 5000,
      tls: url.startsWith('rediss://') ? {} : undefined,
    });

    this.client.on('error', (err) => {
      this.logger.error(`Redis error: ${err.message}`);
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
    await this.client.connect();
  }

  async onModuleDestroy() {
    await this.client.quit();
  }
}
