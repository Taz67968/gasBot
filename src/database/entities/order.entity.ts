import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToOne,
  Index,
} from 'typeorm';
import { OrderStatus } from '@/common/enums/order-status.enum';
import { Customer } from './customer.entity';
import { Agent } from './agent.entity';
import { Payment } from './payment.entity';

/**
 * Core Order entity for GasBot Cash-on-Delivery deliveries.
 * Enforces the strict business flow: PENDING → CASH_ACKNOWLEDGED → AGENT_ASSIGNED → ... → DELIVERED
 * with geospatial delivery location and XAF currency amounts.
 */
@Entity('orders')
@Index(['reference'], { unique: true })
export class Order {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 50, unique: true })
  reference!: string;

  @Column({ type: 'uuid', name: 'customer_id' })
  customerId!: string;

  @ManyToOne(() => Customer, (customer) => customer.orders, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'customer_id' })
  customer!: Customer;

  @Column({ type: 'uuid', nullable: true, name: 'agent_id' })
  agentId?: string;

  @ManyToOne(() => Agent, (agent) => agent.orders, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'agent_id' })
  agent?: Agent;

  @Column({
    type: 'enum',
    enum: OrderStatus,
    default: OrderStatus.PENDING,
  })
  status!: OrderStatus;

  // Delivery location as PostGIS POINT (customer or merchant drop-off point)
  @Column({
    type: 'geography',
    spatialFeatureType: 'Point',
    srid: 4326,
    nullable: false,
    name: 'delivery_location',
  })
  deliveryLocation!: string;

  @Column({ type: 'integer', name: 'total_xaf' })
  totalXaf!: number;

  @Column({ type: 'timestamptz', nullable: true, name: 'acknowledged_at' })
  acknowledgedAt?: Date;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt!: Date;

  // One-to-one with Payment (each order has exactly one payment record)
  @OneToOne(() => Payment, (payment) => payment.order, { cascade: true })
  payment!: Payment;
}
