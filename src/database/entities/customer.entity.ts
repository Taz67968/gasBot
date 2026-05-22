import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { Order } from './order.entity';

/**
 * Customer entity representing end-users placing GasBot delivery orders.
 * Phone numbers are strictly validated as E.164 format at the application layer.
 */
@Entity('customers')
@Index(['phone'], { unique: true })
export class Customer {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 20, unique: true })
  phone!: string;

  @Column({ type: 'varchar', length: 5, default: 'en' })
  language!: string;

  @Column({ type: 'timestamptz', nullable: true, name: 'last_active_at' })
  lastActiveAt?: Date;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt!: Date;

  // Relations
  @OneToMany(() => Order, (order) => order.customer)
  orders!: Order[];
}
