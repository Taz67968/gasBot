"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.envValidationSchema = void 0;
exports.validateEnv = validateEnv;
const Joi = __importStar(require("joi"));
exports.envValidationSchema = Joi.object({
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
    OPENAI_API_KEY: Joi.string()
        .pattern(/^sk-/)
        .required()
        .description('OpenAI API key (must start with sk-)'),
    NODE_ENV: Joi.string()
        .valid('development', 'production', 'test')
        .default('development'),
    PORT: Joi.number().port().default(3000),
})
    .unknown(true)
    .required();
function validateEnv(config) {
    const { error, value } = exports.envValidationSchema.validate(config, {
        abortEarly: false,
        allowUnknown: true,
        stripUnknown: false,
    });
    if (error) {
        console.error('\n');
        console.error('═══════════════════════════════════════════════════════════════');
        console.error('🚨  GAS BOT CONFIGURATION VALIDATION FAILED  🚨');
        console.error('═══════════════════════════════════════════════════════════════');
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
        console.error('  WHATSAPP_VERIFY_TOKEN, OPENAI_API_KEY');
        console.error('═══════════════════════════════════════════════════════════════\n');
        throw new Error('Environment configuration is invalid. See detailed logs above. ' +
            'Fix the issues and restart the application.');
    }
    return value;
}
//# sourceMappingURL=env.validation.js.map