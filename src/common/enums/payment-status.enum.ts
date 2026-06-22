/**
 * Payment states for the Pay-by-Hand model.
 * Only two states: UNPAID (default) and PAID_BY_HAND (confirmed by agent on site).
 */
export enum PaymentStatus {
  UNPAID = 'UNPAID',
  PAID_BY_HAND = 'PAID_BY_HAND',
}
