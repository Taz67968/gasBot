import { PaymentStatus } from "../../common/enums/payment-status.enum";
import { Order } from './order.entity';
import { Agent } from './agent.entity';
export declare class Payment {
    id: string;
    orderId: string;
    order: Order;
    status: PaymentStatus;
    amountXaf: number;
    cashCollectedByAgentId?: string;
    cashCollectedByAgent?: Agent;
    agentConfirmedAt?: Date;
    createdAt: Date;
    updatedAt: Date;
}
