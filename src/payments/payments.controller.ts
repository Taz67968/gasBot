import {
  Controller,
  Post,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '@/common/decorators/roles.decorator';
import { RolesGuard } from '@/common/guards/roles.guard';
import { Role } from '@/common/enums/role.enum';
import { PaymentsService } from './payments.service';
import { AgentConfirmPaymentDto } from './dto/agent-confirm-payment.dto';
import { CurrentUser } from '@/auth/decorators/current-user.decorator'; // we will create a small decorator

/**
 * PaymentController
 * Handles agent cash-on-delivery confirmations (Pay by Hand model).
 */
@Controller('api/v1/payments')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class PaymentsController {
  private readonly logger = new Logger(PaymentsController.name);

  constructor(private readonly paymentsService: PaymentsService) {}

  /**
   * Agent confirms they have physically collected cash for the order.
   * Protected: Only users with AGENT role can call this.
   */
  @Post('agent-confirm')
  @Roles(Role.AGENT)
  @HttpCode(HttpStatus.OK)
  async confirmCashByAgent(
    @Body() dto: AgentConfirmPaymentDto,
    @CurrentUser('sub') agentId: string, // JWT subject = agent id
  ) {
    this.logger.log(`Agent ${agentId} confirming cash for order ${dto.orderId}`);

    return this.paymentsService.confirmCashCollectionByAgent(
      dto.orderId,
      agentId,
    );
  }
}
