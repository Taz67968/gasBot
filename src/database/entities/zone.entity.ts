import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { Agent } from './agent.entity';

/**
 * Geographic delivery zone defined by a PostGIS polygon.
 * Used for agent assignment and coverage mapping.
 */
@Entity('zones')
export class Zone {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 100 })
  name!: string;

  // PostGIS Geography polygon in WGS84 (SRID 4326)
  @Column({
    type: 'geography',
    spatialFeatureType: 'Polygon',
    srid: 4326,
    nullable: true,
  })
  polygon?: string; // Stored as WKT or GeoJSON string in TypeORM; use ST_ functions in queries

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt!: Date;

  // Relations
  @OneToMany(() => Agent, (agent) => agent.zone)
  agents!: Agent[];
}
