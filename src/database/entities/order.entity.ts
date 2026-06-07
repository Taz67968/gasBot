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

  // Image media ID of the gas bottle customer wants (for supplier reference)
  @Column({ type: 'varchar', length: 100, nullable: true, name: 'bottle_image_media_id' })
  bottleImageMediaId?: string;

  @Column({ type: 'timestamptz', nullable: true, name: 'acknowledged_at' })
  acknowledgedAt?: Date;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt!: Date;

  @OneToOne(() => Payment, (payment) => payment.order, { cascade: true })
  payment!: Payment;
}
