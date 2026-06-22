import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
  JoinColumn,
  ManyToOne,
} from 'typeorm';
import { PaymentStatus } from '@/common/enums/payment-status.enum';
import { Order } from './order.entity';
import { Agent } from './agent.entity';

/**
 * Payment entity implementing the strict "Pay by Hand" / Cash on Delivery model.
 * Cash is collected on-site by the assigned agent and confirmed via agent_confirmed_at.
 */
@Entity('payments')
export class Payment {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', unique: true, name: 'order_id' })
  orderId!: string;

  @OneToOne(() => Order, (order) => order.payment, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'order_id' })
  order!: Order;

  @Column({
    type: 'enum',
    enum: PaymentStatus,
    default: PaymentStatus.UNPAID,
  })
  status!: PaymentStatus;

  @Column({ type: 'integer', name: 'amount_xaf' })
  amountXaf!: number;

  @Column({ type: 'uuid', nullable: true, name: 'cash_collected_by_agent_id' })
  cashCollectedByAgentId?: string;

  @ManyToOne(() => Agent, (agent) => agent.collectedPayments, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'cash_collected_by_agent_id' })
  cashCollectedByAgent?: Agent;

  @Column({ type: 'timestamptz', nullable: true, name: 'agent_confirmed_at' })
  agentConfirmedAt?: Date;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt!: Date;
}
