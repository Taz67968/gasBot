/**
 * Job data interfaces for the BullMQ geospatial matching queue.
 */
export interface StartCascadeJob {
  orderId: string;
  initialRadiusMeters: number; // e.g. 5000
  maxRadiusMeters: number; // e.g. 10000
}

export interface TimeoutCascadeJob {
  orderId: string;
  agentId: string;
  attemptIndex: number;
}
