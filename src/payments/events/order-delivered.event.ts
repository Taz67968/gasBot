/**
 * Event emitted when an order is successfully marked as DELIVERED
 * after the agent confirms cash collection (Pay by Hand).
 */
export class OrderDeliveredEvent {
  constructor(
    public readonly orderId: string,
    public readonly customerPhone: string,
    public readonly agentId: string,
    public readonly amountXaf: number,
    public readonly deliveredAt: Date,
  ) {}
}
