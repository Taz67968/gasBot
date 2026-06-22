/**
 * Standard JWT payload for GasBot authenticated principals (agents or admins).
 */
export interface JwtPayload {
  sub: string; // user id (agent id or admin id)
  phone: string;
  role: string; // 'AGENT' | 'ADMIN'
  jti?: string; // JWT ID for token revocation / session tracking
  iat?: number;
  exp?: number;
}

/**
 * Shape of an active Redis-stored token session profile.
 */
export interface ActiveTokenSession {
  tokenId: string; // jti
  userId: string;
  phone: string;
  role: string;
  issuedAt: Date;
  expiresAt: Date;
  lastUsedAt?: Date;
}
