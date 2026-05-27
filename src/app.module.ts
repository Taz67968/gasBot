import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { join } from 'path';
import { EventEmitterModule } from '@nestjs/event-emitter';

import { validateEnv } from '@/config/env.validation';
import { ConfigurationModule } from '@/config/config.module';
import { ConfigLoader } from '@/config/configuration';

import { AuthModule } from '@/auth/auth.module';
import { RolesGuard } from '@/common/guards/roles.guard';

import { Customer } from '@/database/entities/customer.entity';
import { Zone } from '@/database/entities/zone.entity';
import { Agent } from '@/database/entities/agent.entity';
import { Order } from '@/database/entities/order.entity';
import { Payment } from '@/database/entities/payment.entity';

import { WhatsappModule } from '@/whatsapp/whatsapp.module';
import { VisionModule } from '@/vision/vision.module';
import { CustomerModule } from '@/customer/customer.module';
import { ConversationModule } from '@/conversation/conversation.module';
import { BullModule } from '@nestjs/bullmq';
import { GeoModule } from '@/geo/geo.module';
import { MatchingModule } from '@/matching/matching.module';
import { PaymentsModule } from '@/payments/payments.module';
import { DispatchModule } from '@/dispatch/dispatch.module';
import { TrackingModule } from '@/tracking/tracking.module';

import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [
    // Global configuration module with Joi validation at bootstrap time.
    // The validate function (env.validation.ts) will:
    //   1. Print highly visible detailed error logs for any missing/invalid key
    //   2. Throw synchronously → hard-abort the entire application startup
    ConfigModule.forRoot({
      isGlobal: true, // available everywhere without re-import
      cache: true, // cache parsed values for performance
      validate: validateEnv, // custom strict validator (not the default Joi pipe)
      // envFilePath can be added for local .env loading outside Docker
      // envFilePath: '.env',
    }),

    // Enterprise TypeORM connection with strict production settings
    // Uses validated DB config, explicit entities, and migration-based schema management
    TypeOrmModule.forRootAsync({
      imports: [ConfigurationModule],
      inject: [ConfigLoader],
      useFactory: (config: ConfigLoader) => ({
        type: 'postgres',
        host: config.dbHost,
        port: config.dbPort,
        username: config.dbUsername,
        password: config.dbPassword,
        database: config.dbName,
        entities: [Customer, Zone, Agent, Order, Payment],
        migrations: [join(__dirname, '../database/migrations/*{.ts,.js}')],
        migrationsRun: config.nodeEnv === 'test', // run migrations in test environment
        synchronize: config.nodeEnv === 'test', // auto-sync schema for testing
        logging: config.nodeEnv !== 'production',
        ssl:
          config.nodeEnv !== 'development'
            ? { rejectUnauthorized: false }
            : false,
        extra: {
          connectionTimeoutMillis: 10000,
          idleTimeoutMillis: 30000,
        },
        // Extra production hardening
        maxQueryExecutionTime: 10000,
      }),
    }),

    AuthModule,

    // Global event emitter for domain events (used by Whatsapp webhook → Vision / Order flows)
    EventEmitterModule.forRoot(),

    // WhatsApp Cloud API + Vision analysis modules
    WhatsappModule,
    VisionModule,

    // Customer profile + Redis-driven conversational state machine
    CustomerModule,
    ConversationModule,

    // BullMQ connection (shared Redis instance used by matching queue)
    BullModule.forRootAsync({
      imports: [ConfigurationModule],
      inject: [ConfigLoader],
      useFactory: (config: ConfigLoader) => {
        const url = new URL(config.redisUrl);
        return {
          connection: {
            host: url.hostname,
            port: parseInt(url.port || '6379', 10),
            password: url.password || undefined,
            tls: config.redisUrl.startsWith('rediss://') ? {} : undefined,
          },
        };
      },
    }),

    // Geospatial + Real-time driver assignment modules
    GeoModule,
    MatchingModule,

    // Payments & Settlements (Cash on Delivery / Pay by Hand)
    PaymentsModule,

    // Driver dispatch communications + high-frequency Redis geospatial tracking
    DispatchModule,
    TrackingModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Global role guard (used via @UseGuards(RolesGuard) + @Roles() on controllers/routes)
    RolesGuard,
  ],
  exports: [RolesGuard],
})
export class AppModule {}
