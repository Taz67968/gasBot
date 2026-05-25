import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * Extracts the authenticated user (from JWT payload) or a specific property.
 *
 * Usage:
 *   @CurrentUser() user
 *   @CurrentUser('sub') agentId
 */
export const CurrentUser = createParamDecorator(
  (data: string | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user; // attached by Passport JWT strategy

    return data ? user?.[data] : user;
  },
);
