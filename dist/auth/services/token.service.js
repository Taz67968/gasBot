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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TokenService = void 0;
const common_1 = require("@nestjs/common");
const jwt_1 = require("@nestjs/jwt");
const configuration_1 = require("../../config/configuration");
const ioredis_1 = __importDefault(require("ioredis"));
let TokenService = class TokenService {
    jwtService;
    config;
    redis;
    constructor(jwtService, config) {
        this.jwtService = jwtService;
        this.config = config;
        this.redis = new ioredis_1.default(this.config.redisUrl, {
            maxRetriesPerRequest: 3,
            enableReadyCheck: true,
            lazyConnect: true,
        });
        this.redis.on('error', (err) => {
            console.error('[TokenService] Redis connection error:', err);
        });
        this.redis.on('connect', () => {
            console.log('[TokenService] Connected to Redis for token session management');
        });
    }
    async generateAccessToken(payload) {
        const jti = this.generateJti();
        const now = Math.floor(Date.now() / 1000);
        const expiresIn = 3600 * 8;
        const exp = now + expiresIn;
        const fullPayload = {
            ...payload,
            jti,
            iat: now,
            exp,
        };
        const token = await this.jwtService.signAsync(fullPayload, {
            secret: this.config.jwtSecret,
            expiresIn: `${expiresIn}s`,
        });
        const sessionKey = this.getSessionKey(payload.sub, jti);
        const sessionProfile = {
            tokenId: jti,
            userId: payload.sub,
            phone: payload.phone,
            role: payload.role,
            issuedAt: new Date(now * 1000),
            expiresAt: new Date(exp * 1000),
        };
        await this.redis.setex(sessionKey, expiresIn, JSON.stringify(sessionProfile));
        return token;
    }
    async isTokenActive(userId, jti) {
        if (!jti)
            return false;
        const sessionKey = this.getSessionKey(userId, jti);
        const exists = await this.redis.exists(sessionKey);
        return exists === 1;
    }
    async logActiveSessionProfile(payload) {
        if (!payload.jti) {
            return;
        }
        const sessionKey = this.getSessionKey(payload.sub, payload.jti);
        const raw = await this.redis.get(sessionKey);
        if (raw) {
            const profile = JSON.parse(raw);
            profile.lastUsedAt = new Date();
            const ttl = await this.redis.ttl(sessionKey);
            if (ttl > 0) {
                await this.redis.setex(sessionKey, ttl, JSON.stringify(profile));
            }
            console.log('[TokenService] Active JWT session validated', {
                userId: profile.userId,
                phone: profile.phone,
                role: profile.role,
                jti: profile.tokenId,
                issuedAt: profile.issuedAt,
                expiresAt: profile.expiresAt,
                lastUsedAt: profile.lastUsedAt,
                remainingSeconds: ttl,
            });
        }
    }
    async revokeToken(userId, jti) {
        const sessionKey = this.getSessionKey(userId, jti);
        await this.redis.del(sessionKey);
        console.log(`[TokenService] Token revoked for user ${userId} jti ${jti}`);
    }
    getSessionKey(userId, jti) {
        if (!jti)
            return `gasbot:auth:session:${userId}:unknown`;
        return `gasbot:auth:session:${userId}:${jti}`;
    }
    generateJti() {
        return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
    }
    async onModuleDestroy() {
        await this.redis.quit();
    }
};
exports.TokenService = TokenService;
exports.TokenService = TokenService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [jwt_1.JwtService,
        configuration_1.ConfigLoader])
], TokenService);
//# sourceMappingURL=token.service.js.map