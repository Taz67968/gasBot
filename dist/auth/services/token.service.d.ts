import { OnModuleDestroy } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigLoader } from "../../config/configuration";
import { JwtPayload } from '../interfaces/jwt-payload.interface';
export declare class TokenService implements OnModuleDestroy {
    private readonly jwtService;
    private readonly config;
    private readonly redis;
    constructor(jwtService: JwtService, config: ConfigLoader);
    generateAccessToken(payload: Omit<JwtPayload, 'iat' | 'exp' | 'jti'>): Promise<string>;
    isTokenActive(userId: string, jti?: string): Promise<boolean>;
    logActiveSessionProfile(payload: JwtPayload): Promise<void>;
    revokeToken(userId: string, jti: string): Promise<void>;
    private getSessionKey;
    private generateJti;
    onModuleDestroy(): Promise<void>;
}
