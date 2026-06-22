import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GeoService } from './geo.service';
import { Agent } from '@/database/entities/agent.entity';

/**
 * GeoModule
 * Provides high-performance PostGIS geospatial services for driver assignment.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Agent])],
  providers: [GeoService],
  exports: [GeoService],
})
export class GeoModule {}
