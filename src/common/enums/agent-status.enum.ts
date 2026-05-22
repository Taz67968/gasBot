/**
 * Lifecycle status for delivery agents in the GasBot network.
 * Enforced at database level via PostgreSQL ENUM and in application logic.
 */
export enum AgentStatus {
  PENDING = 'PENDING',
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
  OFFLINE = 'OFFLINE',
  BUSY = 'BUSY',
}
