import { Order } from './order.entity';
export declare class Customer {
    id: string;
    phone: string;
    language: string;
    lastActiveAt?: Date;
    createdAt: Date;
    updatedAt: Date;
    orders: Order[];
}
