import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { Role } from '../enums/role.enum';
import { JwtPayload } from '@/auth/interfaces/jwt-payload.interface';

/**
 * RolesGuard
 * Execution context guard that enforces role-based access control.
 *
 * - Reads required roles from @Roles() metadata via Reflector
 * - Compares against the authenticated user's role (from JWT payload)
 * - Throws 403 Forbidden on mismatch
 * - Must be used together with @UseGuards(AuthGuard('jwt'), RolesGuard)
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // No @Roles decorator present → public for authenticated users
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{ user: JwtPayload }>();
    const user = request.user;

    if (!user || !user.role) {
      throw new ForbiddenException('Authentication required');
    }

    const hasRole = requiredRoles.some((role) => (user.role as Role) === role);

    if (!hasRole) {
      throw new ForbiddenException(
        `Insufficient permissions. Required roles: [${requiredRoles.join(', ')}]. Your role: ${user.role}`,
      );
    }

    return true;
  }
}
