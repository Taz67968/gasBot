import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { validateEnv } from '@/config/env.validation';
import { ConfigLoader } from '@/config/configuration';

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
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // The structural loader class - injectable typed facade over ConfigService
    ConfigLoader,
  ],
})
export class AppModule {}
