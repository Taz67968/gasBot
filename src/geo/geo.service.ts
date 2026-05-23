import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Agent } from '@/database/entities/agent.entity';
import { AgentStatus } from '@/common/enums/agent-status.enum';

/**
 * Result type returned by geospatial nearest-agent queries.
 */
export interface NearestAgent {
  agent: Agent;
  distanceMeters: number;
}

/**
 * GeoService
 * High-performance PostGIS-backed geospatial queries for real-time driver assignment.
 */
@Injectable()
export class GeoService {
  private readonly logger = new Logger(GeoService.name);

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Finds the nearest ACTIVE agents within a given radius using PostGIS.
   *
   * Uses:
   *   - ST_DWithin( geography, geography, distance ) for efficient bounding-box filtering (uses GiST index)
   *   - ST_Distance for precise distance calculation in the result
   *
   * All distances are in meters (SRID 4326 geography).
   *
   * @param lat - Latitude of the delivery location (WGS84)
   * @param lng - Longitude of the delivery location (WGS84)
   * @param radiusMeters - Search radius in meters (e.g. 5000 for 5km)
   * @returns Sorted list of nearest ACTIVE agents (ascending by distance)
   */
  async findNearestAgents(
    lat: number,
    lng: number,
    radiusMeters: number,
  ): Promise<NearestAgent[]> {
    const query = `
      SELECT 
        a.*,
        ST_Distance(
          a.location, 
          ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography
        ) AS distance_meters
      FROM agents a
      WHERE 
        a.status = $3
        AND a.location IS NOT NULL
        AND ST_DWithin(
          a.location, 
          ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, 
          $4
        )
      ORDER BY distance_meters ASC
      LIMIT 100;
    `;

    try {
      const rows = await this.dataSource.query(query, [
        lng,                    // Note: PostGIS ST_MakePoint(lng, lat)
        lat,
        AgentStatus.ACTIVE,
        radiusMeters,
      ]);

      return rows.map((row: any) => {
        // Map raw row back to Agent entity shape (TypeORM does not hydrate automatically on raw query)
        const agent = Object.assign(new Agent(), row) as Agent;
        // Remove the extra distance column from the entity instance
        delete (agent as any).distance_meters;

        return {
          agent,
          distanceMeters: Math.round(parseFloat(row.distance_meters)),
        };
      });
    } catch (error: any) {
      this.logger.error(`PostGIS nearest agents query failed: ${error.message}`);
      throw error;
    }
  }
}
