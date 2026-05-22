import { AgentStatus } from "../../common/enums/agent-status.enum";
import { Zone } from './zone.entity';
import { Order } from './order.entity';
import { Payment } from './payment.entity';
export declare class Agent {
    id: string;
    phone: string;
    fullName: string;
    status: AgentStatus;
    location?: string;
    zoneId?: string;
    zone?: Zone;
    createdAt: Date;
    updatedAt: Date;
    orders: Order[];
    collectedPayments: Payment[];
}
