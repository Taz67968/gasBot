import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TrackingController } from './tracking.controller';
import { TrackingService } from './tracking.service';

/**
 * TrackingModule
 * Provides high-frequency Redis GeoSet tracking + write suppression + secure customer tracking URLs.
 */
@Module({
  imports: [JwtModule.register({})], // JwtService will use secret from ConfigLoader inside the service
  controllers: [TrackingController],
  providers: [TrackingService],
  exports: [TrackingService],
})
export class TrackingModule {}
