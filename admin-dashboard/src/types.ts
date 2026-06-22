export interface AdminUser {
  id: string;
  email: string;
  role: 'ADMIN' | 'SUPERVISOR';
}

export interface Agent {
  id: string;
  fullName: string;
  phone: string;
  status: 'ACTIVE' | 'BUSY' | 'OFFLINE' | 'PENDING' | 'SUSPENDED';
  location?: {
    lat: number;
    lng: number;
  };
  lastUpdated?: string;
}

export interface Order {
  id: string;
  reference: string;
  customerPhone: string;
  status: 'PENDING' | 'CASH_ACKNOWLEDGED' | 'AGENT_ASSIGNED' | 'EN_ROUTE' | 'NEARBY' | 'DELIVERED' | 'CANCELLED' | 'WAITING_FOR_AGENT';
  totalXaf: number;
  agentId?: string;
  agentName?: string;
  createdAt: string;
  deliveryLocation: {
    lat: number;
    lng: number;
  };
}

export interface GasCylinderType {
  id: string;
  name: string;
  sizeKg: number;
  basePriceXaf: number;
}

export interface Zone {
  id: string;
  name: string;
  polygon: Array<{ lat: number; lng: number }>; // Simple array of points for polygon
}

export interface AgentLocationUpdate {
  agentId: string;
  lat: number;
  lng: number;
  status: Agent['status'];
  timestamp: string;
  currentOrderId?: string;
}

export type ConnectionStatus = 'connected' | 'disconnected' | 'connecting';
