import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigLoader } from '@/config/configuration';
import { RedisService } from '@/redis/redis.service';

export interface AgentLocationUpdate {
  latitude: number;
  longitude: number;
  accuracy?: number;
  timestamp?: string;
}

@Injectable()
export class TrackingService {
  private readonly logger = new Logger(TrackingService.name);
  private readonly GEO_KEY = 'geo:agents:live';
  private readonly LAST_POS_PREFIX = 'agent:lastpos:';
  private readonly MOVEMENT_THRESHOLD_METERS = 10;

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly jwtService: JwtService,
    private readonly config: ConfigLoader,
    private readonly redisService: RedisService,
  ) {
    this.redisService.getClient().on('error', (err) => {
      this.logger.error(`Redis error in TrackingService: ${err.message}`);
    });
  }

  private getRedis() {
    return this.redisService.getClient();
  }

  /**
   * High-efficiency geospatial write-suppression layer.
   * Updates Redis GeoSet always (for real-time queries).
   * Only writes to PostgreSQL if the agent has moved more than 10 meters.
   */
  async updateAgentLocation(
    agentId: string,
    lat: number,
    lng: number,
    accuracy?: number,
  ): Promise<{ updatedDb: boolean; distanceMoved: number | null }> {
    const lastPosKey = `${this.LAST_POS_PREFIX}${agentId}`;

    // 1. Read last cached position from Redis (high-speed)
    const lastPos = await this.getRedis().hgetall(lastPosKey);

    let distanceMoved: number | null = null;
    let shouldWriteToDb = true;

    if (lastPos && lastPos.lat && lastPos.lng) {
      const lastLat = parseFloat(lastPos.lat);
      const lastLng = parseFloat(lastPos.lng);

      distanceMoved = this.calculateHaversineDistance(
        lastLat,
        lastLng,
        lat,
        lng,
      );

      if (distanceMoved < this.MOVEMENT_THRESHOLD_METERS) {
        shouldWriteToDb = false;
        this.logger.debug(
          `Agent ${agentId} moved only ${distanceMoved.toFixed(1)}m — suppressing DB write`,
        );
      }
    }

    // 2. Always update Redis for high-frequency access (GeoSet + last position cache)
    const pipeline = this.getRedis().pipeline();

    // Update GeoSet (for GEOSEARCH / GEORADIUS queries)
    pipeline.geoadd(this.GEO_KEY, lng, lat, agentId);

    // Update last known position for suppression logic
    pipeline.hset(lastPosKey, {
      lat: lat.toString(),
      lng: lng.toString(),
      accuracy: accuracy?.toString() || '0',
      updatedAt: new Date().toISOString(),
    });

    // Set TTL on lastpos to prevent unbounded growth (24h)
    pipeline.expire(lastPosKey, 86400);

    await pipeline.exec();

    let updatedDb = false;

    // 3. Conditional heavy DB write
    if (shouldWriteToDb) {
      try {
        await this.dataSource.query(
          `UPDATE agents 
           SET location = ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, 
               updated_at = NOW() 
           WHERE id = $3`,
          [lng, lat, agentId],
        );
        updatedDb = true;
        this.logger.log(
          `Agent ${agentId} location persisted to DB (moved ${distanceMoved?.toFixed(1) || 'N/A'}m)`,
        );
      } catch (error: any) {
        this.logger.error(
          `Failed to update agent ${agentId} location in DB: ${error.message}`,
        );
        // Do not throw — Redis is still updated for real-time use
      }
    }

    return { updatedDb, distanceMoved };
  }

  /**
   * Generates a secure, time-limited tracking URL for a customer.
   * Embeds a signed JWT that contains the orderId and allows access to live driver coordinates.
   */
  generateTrackingUrl(orderId: string): string {
    const payload = {
      orderId,
      type: 'live-tracking',
      iat: Math.floor(Date.now() / 1000),
    };

    const token = this.jwtService.sign(payload, {
      secret: this.config.jwtSecret,
      expiresIn: '4h', // Tracking window
    });

    // In production this would be the public base URL from config
    const baseUrl = process.env.PUBLIC_BASE_URL || 'https://gasbot.app';
    return `${baseUrl}/track/${token}`;
  }

  /**
   * Haversine formula for accurate meter-level distance between two WGS84 points.
   */
  private calculateHaversineDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ): number {
    const R = 6371000; // Earth radius in meters
    const dLat = this.toRadians(lat2 - lat1);
    const dLon = this.toRadians(lon2 - lon1);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRadians(lat1)) *
        Math.cos(this.toRadians(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }

  /**
   * Optional helper: Get current live position from Redis GeoSet.
   */
  async getLiveAgentPosition(
    agentId: string,
  ): Promise<{ lat: number; lng: number } | null> {
    const result = await this.getRedis().geopos(this.GEO_KEY, agentId);
    if (!result || !result[0]) return null;

    const [lng, lat] = result[0];
    return { lat: parseFloat(lat), lng: parseFloat(lng) };
  }
}
