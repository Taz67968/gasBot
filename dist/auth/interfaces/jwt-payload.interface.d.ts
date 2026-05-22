export interface JwtPayload {
    sub: string;
    phone: string;
    role: string;
    jti?: string;
    iat?: number;
    exp?: number;
}
export interface ActiveTokenSession {
    tokenId: string;
    userId: string;
    phone: string;
    role: string;
    issuedAt: Date;
    expiresAt: Date;
    lastUsedAt?: Date;
}
