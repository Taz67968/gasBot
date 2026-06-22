/**
 * Application roles for RBAC (Role-Based Access Control).
 * Used with @Roles() decorator and RolesGuard.
 */
export enum Role {
  ADMIN = 'ADMIN',
  AGENT = 'AGENT',
  // CUSTOMER role can be added later if customer-facing JWTs are required
}
