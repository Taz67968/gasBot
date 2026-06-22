export interface AssignmentOffer {
  orderId: string;
  reference: string;
  gasType: string;
  sizeKg: number;
  amountXaf: number;
  destination: {
    lat: number;
    lng: number;
    address?: string;
  };
  estimatedDistanceMeters?: number;
  expiresAt: string; // ISO
}

export interface ActiveAssignment {
  orderId: string;
  reference: string;
  gasType: string;
  amountXaf: number;
  destination: {
    lat: number;
    lng: number;
    address?: string;
  };
  acceptedAt: string;
}

export interface PaymentConfirmation {
  orderId: string;
  amountXaf: number;
  confirmedAt?: string;
  agentId?: string;
}

export type ConnectionStatus = 'online' | 'offline';
