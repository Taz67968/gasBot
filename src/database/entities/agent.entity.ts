import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { AgentStatus } from '@/common/enums/agent-status.enum';
import { Zone } from './zone.entity';
import { Order } from './order.entity';
import { Payment } from './payment.entity';

/**
 * Delivery agent (GasBot field operative) with real-time geospatial tracking.
 * Location is a PostGIS POINT used for proximity-based assignment.
 */
@Entity('agents')
@Index(['phone'], { unique: true })
export class Agent {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 20, unique: true })
  phone!: string;

  @Column({ type: 'varchar', length: 150, name: 'full_name' })
  fullName!: string;

  @Column({
    type: 'enum',
    enum: AgentStatus,
    default: AgentStatus.PENDING,
  })
  status!: AgentStatus;

  // PostGIS Geography point (current reported location)
  @Column({
    type: 'geography',
    spatialFeatureType: 'Point',
    srid: 4326,
    nullable: true,
  })
  location?: string;

  @Column({ type: 'uuid', nullable: true, name: 'zone_id' })
  zoneId?: string;

  @ManyToOne(() => Zone, (zone) => zone.agents, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'zone_id' })
  zone?: Zone;

  // Gas type supplied by this agent (for gas suppliers)
  @Column({ type: 'varchar', length: 50, nullable: true, name: 'gas_type' })
  gasType?: string;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt!: Date;

  // Relations
  @OneToMany(() => Order, (order) => order.agent)
  orders!: Order[];

  @OneToMany(() => Payment, (payment) => payment.cashCollectedByAgent)
  collectedPayments!: Payment[];
}
