/**
 * Order lifecycle states for the strict Cash-on-Delivery / Pay-by-Hand flow.
 * The CASH_ACKNOWLEDGED state is critical before agent assignment.
 */
export enum OrderStatus {
  PENDING = 'PENDING',
  CASH_ACKNOWLEDGED = 'CASH_ACKNOWLEDGED',
  AGENT_ASSIGNED = 'AGENT_ASSIGNED',
  EN_ROUTE = 'EN_ROUTE',
  NEARBY = 'NEARBY',
  DELIVERED = 'DELIVERED',
  CANCELLED = 'CANCELLED',
}
