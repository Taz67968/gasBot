import {
  Controller,
  Get,
  UseGuards,
  HttpCode,
  HttpStatus,
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
  constructor(private readonly paymentsService: PaymentsService) {}

  /**
   * Returns aggregated cash settlement data per agent.
   * Protected: ADMIN role only.
   */
  @Get('summary')
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  async getSettlementsSummary(): Promise<SettlementSummaryRow[]> {
    return this.paymentsService.getAgentSettlementSummary();
  }
}
