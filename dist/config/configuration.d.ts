import { ConfigService } from '@nestjs/config';
import { EnvConfig } from './env.validation';
export declare class ConfigLoader {
    private readonly configService;
    constructor(configService: ConfigService<EnvConfig>);
    get dbHost(): string;
    get dbPort(): number;
    get dbUsername(): string;
    get dbPassword(): string;
    get dbName(): string;
    get databaseConfig(): {
        host: string;
        port: number;
        username: string;
        password: string;
        database: string;
    };
    get redisUrl(): string;
    get jwtSecret(): string;
    get whatsappApiToken(): string;
    get whatsappVerifyToken(): string;
    get openaiApiKey(): string;
    get nodeEnv(): 'development' | 'production' | 'test';
    get port(): number;
    get isProduction(): boolean;
    get safeConfigSnapshot(): Record<string, unknown>;
}
