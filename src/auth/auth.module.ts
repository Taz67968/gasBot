import { Module, Global } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';

import { ConfigLoader } from '@/config/configuration';
import { TokenService } from './services/token.service';
import { JwtStrategy } from './strategies/jwt.strategy';

/**
 * AuthModule
 * Production authentication and authorization core for GasBot.
 *
 * - Registers Passport JWT strategy
 * - Provides TokenService (signing + Redis session engine)
 * - Exports JwtModule and TokenService for use in controllers/guards
 * - JWT secret sourced exclusively from validated environment (never hardcoded)
 */
@Global()
@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      inject: [ConfigLoader],
      useFactory: (config: ConfigLoader) => ({
        secret: config.jwtSecret,
        signOptions: {
          algorithm: 'HS256',
          expiresIn: '8h',
        },
      }),
    }),
  ],
  providers: [TokenService, JwtStrategy],
  exports: [TokenService, JwtModule, PassportModule],
})
export class AuthModule {}
