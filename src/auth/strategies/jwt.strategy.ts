import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigLoader } from '@/config/configuration';
import { TokenService } from '../services/token.service';
import { JwtPayload } from '../interfaces/jwt-payload.interface';

/**
 * JwtStrategy
 * Production Passport JWT strategy with custom Redis-backed token state validation.
 *
 * - Extracts Bearer token from Authorization header
 * - Validates signature using HS256 + JWT_SECRET
 * - Performs additional Redis session lookup to support instant revocation
 * - Logs every validated active token session profile with absolute expiration
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigLoader,
    private readonly tokenService: TokenService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false, // let Passport handle exp claim first
      secretOrKey: config.jwtSecret,
      passReqToCallback: false,
    });
  }

  /**
   * Passport calls this after signature + exp validation succeeds.
   * We add our Redis state check + detailed session logging here.
   */
  async validate(payload: JwtPayload): Promise<JwtPayload> {
    if (!payload.sub || !payload.role || !payload.phone) {
      throw new UnauthorizedException('Invalid token payload structure');
    }

    // === Custom Redis Token State Check ===
    const isActive = await this.tokenService.isTokenActive(
      payload.sub,
      payload.jti,
    );

    if (!isActive) {
      throw new UnauthorizedException(
        'Token has been revoked or session expired',
      );
    }

    // Log the active session profile (production observability)
    await this.tokenService.logActiveSessionProfile(payload);

    // Return the payload - it will be attached to request.user
    return payload;
  }
}
