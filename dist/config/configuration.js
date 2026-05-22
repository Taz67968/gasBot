"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConfigLoader = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
let ConfigLoader = class ConfigLoader {
    configService;
    constructor(configService) {
        this.configService = configService;
    }
    get dbHost() {
        return this.configService.getOrThrow('DB_HOST');
    }
    get dbPort() {
        return this.configService.getOrThrow('DB_PORT');
    }
    get dbUsername() {
        return this.configService.getOrThrow('DB_USERNAME');
    }
    get dbPassword() {
        return this.configService.getOrThrow('DB_PASSWORD');
    }
    get dbName() {
        return this.configService.getOrThrow('DB_NAME');
    }
    get databaseConfig() {
        return {
            host: this.dbHost,
            port: this.dbPort,
            username: this.dbUsername,
            password: this.dbPassword,
            database: this.dbName,
        };
    }
    get redisUrl() {
        return this.configService.getOrThrow('REDIS_URL');
    }
    get jwtSecret() {
        return this.configService.getOrThrow('JWT_SECRET');
    }
    get whatsappApiToken() {
        return this.configService.getOrThrow('WHATSAPP_API_TOKEN');
    }
    get whatsappVerifyToken() {
        return this.configService.getOrThrow('WHATSAPP_VERIFY_TOKEN');
    }
    get openaiApiKey() {
        return this.configService.getOrThrow('OPENAI_API_KEY');
    }
    get nodeEnv() {
        return (this.configService.get('NODE_ENV') ?? 'development');
    }
    get port() {
        return this.configService.getOrThrow('PORT');
    }
    get isProduction() {
        return this.nodeEnv === 'production';
    }
    get safeConfigSnapshot() {
        return {
            nodeEnv: this.nodeEnv,
            port: this.port,
            dbHost: this.dbHost,
            dbPort: this.dbPort,
            dbName: this.dbName,
            dbUsername: this.dbUsername,
            redisUrl: this.redisUrl.replace(/:[^:]*@/, ':***@'),
            jwtSecret: '***REDACTED***',
            whatsappApiToken: '***REDACTED***',
            whatsappVerifyToken: '***REDACTED***',
            openaiApiKey: '***REDACTED***',
        };
    }
};
exports.ConfigLoader = ConfigLoader;
exports.ConfigLoader = ConfigLoader = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], ConfigLoader);
//# sourceMappingURL=configuration.js.map