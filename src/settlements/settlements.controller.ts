import {
  Controller,
  Get,
  UseGuards,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '@/common/decorators/roles.decorator';
import { RolesGuard } from '@/common/guards/roles.guard';
import { Role } from '@/common/enums/role.enum';
import { PaymentsService } from '@/payments/payments.service';

/**
 * SettlementSummaryRow
 * Returned by the admin settlements summary endpoint.
 */
export interface SettlementSummaryRow {
  agentId: string;
  agentName: string;
  totalDeliveriesCompleted: number;
  totalCashCollectedByHand: number;
  unsettledCashBalanceDue: number;
}

/**
 * SettlementsController
 * Administrative endpoints for financial reconciliation (Pay by Hand model).
 */
@Controller('api/v1/admin/settlements')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class SettlementsController {
  private readonly logger = new Logger(SettlementsController.name);
  constructor(private readonly paymentsService: PaymentsService) {}

  /**
   * Returns aggregated cash settlement data per agent.
   * Protected: ADMIN role only.
   */
  @Get('summary')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  async getSettlementsSummary(): Promise<SettlementSummaryRow[]> {
    this.logger.log('Fetching agent settlement summary');

    try {
      const result = await this.paymentsService.getAgentSettlementSummary();

      this.logger.log(
        `Settlement summary fetched successfully for ${result.length} agents`,
      );
      return result;
    } catch (err: any) {
      this.logger.error(`Failed to fetch settlement summary: ${err.message}`);
      throw err;
    }
  }
}
