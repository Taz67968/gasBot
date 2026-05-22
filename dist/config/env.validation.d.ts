import * as Joi from 'joi';
export interface EnvConfig {
    DB_HOST: string;
    DB_PORT: number;
    DB_USERNAME: string;
    DB_PASSWORD: string;
    DB_NAME: string;
    REDIS_URL: string;
    JWT_SECRET: string;
    WHATSAPP_API_TOKEN: string;
    WHATSAPP_VERIFY_TOKEN: string;
    OPENAI_API_KEY: string;
    NODE_ENV?: 'development' | 'production' | 'test';
    PORT?: number;
}
export declare const envValidationSchema: Joi.ObjectSchema<EnvConfig>;
export declare function validateEnv(config: Record<string, unknown>): EnvConfig;
