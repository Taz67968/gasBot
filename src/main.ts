import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import * as express from 'express';
import { AppModule } from './app.module';
import { ConfigLoader } from '@/config/configuration';
import { Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // === Raw body parser for WhatsApp webhook ===
  // Must be mounted BEFORE the global JSON body parser for the specific route.
  // This gives us the exact Buffer needed to parse the webhook payload.
  // Note: Signature verification is skipped in this setup.
  app.use(
    '/webhook/whatsapp',
    express.raw({ type: 'application/json', limit: '1mb' }),
  );

  // === Request Logging Middleware ===
  const logger = new Logger('HTTP');

  app.use(
    (
      req: express.Request,
      res: express.Response,
      next: express.NextFunction,
    ) => {
      const startTime = Date.now();
      const requestId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      // Store requestId and startTime for later use
      (req as any)['requestId'] = requestId;

      logger.log(`[${requestId}] ${req.method} ${req.url} - START`);

      // Override res.send to log the response
      const originalSend = res.send.bind(res);
      res.send = (body: any) => {
        const duration = Date.now() - startTime;
        const status = res.statusCode;
        logger.log(
          `[${requestId}] ${req.method} ${req.url} - ${status} - ${duration}ms`,
        );
        return originalSend(body);
      };

      // Override res.json to log the response
      const originalJson = res.json.bind(res);
      res.json = (body: any) => {
        const duration = Date.now() - startTime;
        const status = res.statusCode;
        logger.log(
          `[${requestId}] ${req.method} ${req.url} - ${status} - ${duration}ms`,
        );
        return originalJson(body);
      };

      // Override res.end for cases where neither send nor json is called
      const originalEnd = res.end.bind(res);
      res.end = (...chunks: any[]) => {
        const duration = Date.now() - startTime;
        const status = res.statusCode;
        if (!res.writableEnded) {
          logger.log(
            `[${requestId}] ${req.method} ${req.url} - ${status} - ${duration}ms`,
          );
        }
        return originalEnd(...chunks);
      };

      next();
    },
  );

  // === Global Error Handler ===
  app.use(
    (
      err: any,
      req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      const errorLogger = new Logger('ERROR');
      const requestId = (req as any)['requestId'] || 'unknown';

      errorLogger.error(
        `[${requestId}] Error on ${req.method} ${req.url}: ${err.message}`,
      );
      if (err.stack) {
        errorLogger.error(`[${requestId}] Stack: ${err.stack}`);
      }

      res.status(err.status || 500).json({
        statusCode: err.status || 500,
        message: err.message || 'Internal server error',
        requestId,
      });
    },
  );

  // Retrieve the validated configuration loader (guaranteed non-null after ConfigModule)
  const config = app.get(ConfigLoader);

  // Initialize the datasource and run migrations explicitly before the app starts
  const dataSource = app.get(DataSource);
  try {
    if (!dataSource.isInitialized) {
      await dataSource.initialize();
      logger.log('Database connection initialized');
    }

    logger.log('Running database migrations...');
    const appliedMigrations = await dataSource.runMigrations();

    if (appliedMigrations.length > 0) {
      logger.log(
        `Database migrations completed successfully (${appliedMigrations.length} applied)`,
      );
    } else {
      logger.log('Database migrations completed successfully (no pending migrations)');
    }
  } catch (migrationError: any) {
    logger.error(`Database migration failed: ${migrationError.message}`);
    if (migrationError.stack) {
      logger.error(`Migration stack: ${migrationError.stack}`);
    }

    try {
      logger.warn('Attempting schema synchronization as a recovery fallback');
      await dataSource.synchronize();
      logger.warn('Schema synchronization completed');
    } catch (syncError: any) {
      logger.error(`Schema synchronization failed: ${syncError.message}`);
      if (syncError.stack) {
        logger.error(`Synchronization stack: ${syncError.stack}`);
      }
    }
  }

  // Enterprise startup banner with safe (redacted) configuration snapshot
  console.log('\n');
  console.log(
    '═══════════════════════════════════════════════════════════════',
  );
  console.log(
    `🚀  GasBot API starting in ${config.nodeEnv.toUpperCase()} mode`,
  );
  console.log(
    '═══════════════════════════════════════════════════════════════',
  );
  console.log('Loaded configuration (secrets masked):');
  console.dir(config.safeConfigSnapshot, { depth: null, colors: true });
  console.log(
    '═══════════════════════════════════════════════════════════════\n',
  );

  const port = config.port;
  await app.listen(port, '0.0.0.0');

  console.log(`✅  GasBot API is listening on http://localhost:${port}\n`);
}

bootstrap().catch((error) => {
  console.error('Failed to start the application:', error);
  if (error.stack) {
    console.error('Stack:', error.stack);
  }
  process.exit(1);
});
