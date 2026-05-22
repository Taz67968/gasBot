import * as Joi from 'joi';

/**
 * Strict environment variable contract for GasBot.
 * Every key listed here is MANDATORY for application bootstrap.
 * Missing or malformed values will cause immediate, loud failure with detailed logs.
 */
export interface EnvConfig {
  // Database (PostGIS)
  DB_HOST: string;
  DB_PORT: number;
  DB_USERNAME: string;
  DB_PASSWORD: string;
  DB_NAME: string;

  // Redis
  REDIS_URL: string;

  // Authentication / Security
  JWT_SECRET: string;

  // WhatsApp Business API (Meta Cloud API)
  WHATSAPP_API_TOKEN: string;
  WHATSAPP_VERIFY_TOKEN: string;
  WHATSAPP_PHONE_NUMBER_ID: string;

  // OpenAI / LLM provider
  OPENAI_API_KEY: string;

  // Optional but recommended for production parity
  NODE_ENV?: 'development' | 'production' | 'test';
  PORT?: number;
}

/**
 * Robust Joi validation schema.
 * - All critical keys are .required()
 * - Strong typing via .port(), .uri(), .string().min()
 * - Detailed error messages for operators
 */
export const envValidationSchema = Joi.object<EnvConfig>({
  DB_HOST: Joi.string()
    .hostname()
    .required()
    .description('PostgreSQL / PostGIS hostname (e.g. postgres or 127.0.0.1)'),

  DB_PORT: Joi.number()
    .port()
    .default(5432)
    .required()
    .description('PostgreSQL port (default 5432)'),

  DB_USERNAME: Joi.string()
    .min(1)
    .required()
    .description('PostgreSQL user with access to the GasBot database'),

  DB_PASSWORD: Joi.string()
    .min(8)
    .required()
    .description('PostgreSQL password (must be at least 8 characters)'),

  DB_NAME: Joi.string()
    .min(1)
    .required()
    .description('Target PostgreSQL database name'),

  REDIS_URL: Joi.string()
    .uri({ scheme: ['redis', 'rediss'] })
    .required()
    .description('Full Redis connection URI (e.g. redis://redis:6379)'),

  JWT_SECRET: Joi.string()
    .min(32)
    .required()
    .description('Cryptographically strong secret used to sign JWTs'),

  WHATSAPP_API_TOKEN: Joi.string()
    .min(20)
    .required()
    .description('Permanent WhatsApp Business API access token from Meta'),

  WHATSAPP_VERIFY_TOKEN: Joi.string()
    .min(8)
    .required()
    .description('Webhook verification token shared with Meta WhatsApp'),

  WHATSAPP_PHONE_NUMBER_ID: Joi.string()
    .min(10)
    .required()
    .description('WhatsApp Phone Number ID (from Meta Business Manager) used as sender'),

  OPENAI_API_KEY: Joi.string()
    .pattern(/^sk-/)
    .required()
    .description('OpenAI API key (must start with sk-)'),

  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),

  PORT: Joi.number().port().default(3000),
})
  .unknown(true) // allow extra keys from process.env without failing
  .required();

/**
 * Custom validation function used by @nestjs/config.
 * Interrupts the entire NestJS bootstrap process if validation fails.
 * Emits highly visible, structured error logs before throwing.
 *
 * This is the "kill switch" that guarantees the application never starts
 * in an invalid configuration state (zero-trust / fail-fast principle).
 */
export function validateEnv(config: Record<string, unknown>): EnvConfig {
  // Explicit cast to satisfy @typescript-eslint/no-unsafe-assignment while
  // preserving the strong return type of the public validateEnv function.
  const { error, value } = envValidationSchema.validate(config, {
    abortEarly: false, // collect ALL errors, not just the first
    allowUnknown: true,
    stripUnknown: false,
  }) as { error?: import('joi').ValidationError; value: EnvConfig };

  if (error) {
    // === STRICT BOOT FAILURE LOGGING ===
    console.error('\n');
    console.error(
      '═══════════════════════════════════════════════════════════════',
    );
    console.error('🚨  GAS BOT CONFIGURATION VALIDATION FAILED  🚨');
    console.error(
      '═══════════════════════════════════════════════════════════════',
    );
    console.error('The application cannot start because one or more required');
    console.error('environment variables are missing or invalid.\n');

    error.details.forEach((detail, index) => {
      const key = detail.path.join('.');
      console.error(`  ${index + 1}. ❌  ${key}`);
      console.error(`      ${detail.message}`);
      if (detail.context?.label) {
        console.error(`      Expected: ${detail.context.label}`);
      }
    });

    console.error('\n');
    console.error('Required environment keys:');
    console.error('  DB_HOST, DB_PORT, DB_USERNAME, DB_PASSWORD, DB_NAME');
    console.error('  REDIS_URL, JWT_SECRET, WHATSAPP_API_TOKEN,');
    console.error('  WHATSAPP_VERIFY_TOKEN, WHATSAPP_PHONE_NUMBER_ID, OPENAI_API_KEY');
    console.error(
      '═══════════════════════════════════════════════════════════════\n',
    );

    // This throw aborts the entire NestFactory.create() / bootstrap lifecycle
    throw new Error(
      'Environment configuration is invalid. See detailed logs above. ' +
        'Fix the issues and restart the application.',
    );
  }

  // Success path - return the validated & casted configuration object
  return value;
}
