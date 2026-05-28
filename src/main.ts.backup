import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import * as express from 'express';
import { AppModule } from './app.module';
import { ConfigLoader } from '@/config/configuration';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // === Raw body parser for WhatsApp webhook signature verification ===
  // Must be mounted BEFORE the global JSON body parser for the specific route.
  // This gives us the exact Buffer needed for HMAC validation in WhatsappController.
  app.use(
    '/webhook/whatsapp',
    express.raw({ type: 'application/json', limit: '1mb' }),
  );

  // Retrieve the validated configuration loader (guaranteed non-null after ConfigModule)
  const config = app.get(ConfigLoader);

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
  await app.listen(port);

  console.log(`✅  GasBot API is listening on http://localhost:${port}\n`);
}

bootstrap().catch((error) => {
  console.error('Failed to start the application:', error);
  if (error.stack) {
    console.error('Stack:', error.stack);
  }
  process.exit(1);
});
