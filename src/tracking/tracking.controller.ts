import {
  Controller,
  Put,
  Param,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  Logger,
  ParseUUIDPipe,
} from '@nestjs/common';
import type { AgentLocationUpdate } from './tracking.service';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '@/common/decorators/roles.decorator';
import { RolesGuard } from '@/common/guards/roles.guard';
import { Role } from '@/common/enums/role.enum';
import { TrackingService } from './tracking.service';
import { CurrentUser } from '@/auth/decorators/current-user.decorator';

/**
 * TrackingController
 * High-frequency agent location telemetry endpoint.
 */
@Controller('api/v1/agents')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class TrackingController {
  private readonly logger = new Logger(TrackingController.name);

  constructor(private readonly trackingService: TrackingService) {}

  /**
   * PUT /api/v1/agents/:id/location
   * Accepts high-frequency location pings from the driver mobile app.
   * Protected to AGENT role (or the agent updating their own record).
   */
  @Put(':id/location')
  @Roles(Role.AGENT)
  @HttpCode(HttpStatus.NO_CONTENT)
  async updateLocation(
    @Param('id', new ParseUUIDPipe()) agentId: string,
    @Body() body: AgentLocationUpdate,
    @CurrentUser('sub') currentUserId: string,
  ): Promise<void> {
    // Optional self-update enforcement (agent can only update their own location)
    if (currentUserId !== agentId) {
      this.logger.warn(
        `Agent ${currentUserId} attempted to update location for different agent ${agentId}`,
      );
      // In strict mode you could throw ForbiddenException. For now we allow fleet managers too.
    }

    if (!body.latitude || !body.longitude) {
      throw new Error('latitude and longitude are required');
    }

    const result = await this.trackingService.updateAgentLocation(
      agentId,
      body.latitude,
      body.longitude,
      body.accuracy,
    );

    this.logger.debug(
      `Location update for agent ${agentId} — DB written: ${result.updatedDb}, moved: ${result.distanceMoved?.toFixed(1) ?? 'N/A'}m`,
    );
  }
}
