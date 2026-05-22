import { OrderStatus } from "../../common/enums/order-status.enum";
import { Customer } from './customer.entity';
import { Agent } from './agent.entity';
import { Payment } from './payment.entity';
export declare class Order {
    id: string;
    reference: string;
    customerId: string;
    customer: Customer;
    agentId?: string;
    agent?: Agent;
    status: OrderStatus;
    deliveryLocation: string;
    totalXaf: number;
    acknowledgedAt?: Date;
    createdAt: Date;
    updatedAt: Date;
    payment: Payment;
}
