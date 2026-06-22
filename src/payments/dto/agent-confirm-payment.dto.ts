import { IsUUID, IsNotEmpty } from 'class-validator';

/**
 * DTO for agent cash-on-delivery confirmation.
 * The agent confirms that they have physically collected cash for the order.
 */
export class AgentConfirmPaymentDto {
  @IsUUID()
  @IsNotEmpty()
  orderId!: string;
}
