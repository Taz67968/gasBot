import { SetMetadata } from '@nestjs/common';
import { Role } from '../enums/role.enum';

/**
 * Roles decorator.
 * Usage:
 *   @Roles(Role.ADMIN, Role.AGENT)
 *   @UseGuards(RolesGuard)
 *   async someProtectedEndpoint() {}
 *
 * Metadata key: 'roles'
 */
export const ROLES_KEY = 'roles';

export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
