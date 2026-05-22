import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * InitialGasbotSchema
 * Production-grade manual migration for GasBot "Cash on Delivery / Pay by Hand" model.
 *
 * - Explicitly enables uuid-ossp (for UUID generation) and postgis (for GEOGRAPHY types and spatial queries)
 * - Creates all five core tables with exact column specifications
 * - Enforces all ENUMs, UNIQUE constraints, FKs, and NOT NULL rules
 * - Creates GIST spatial indexes on agent.location and order.delivery_location
 * - Includes proper down() rollback logic (order matters for FKs)
 *
 * Run with: npm run migration:run (after configuring TypeOrmModule with migrations)
 */
export class InitialGasbotSchema1747914000000 implements MigrationInterface {
  name = 'InitialGasbotSchema1747914000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // === ENABLE REQUIRED EXTENSIONS (idempotent) ===
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "postgis"`);

    // === ENUM TYPES ===
    await queryRunner.query(`
      CREATE TYPE "public"."agent_status_enum" AS ENUM (
        'PENDING',
        'ACTIVE',
        'SUSPENDED',
        'OFFLINE',
        'BUSY'
      )
    `);

    await queryRunner.query(`
      CREATE TYPE "public"."order_status_enum" AS ENUM (
        'PENDING',
        'CASH_ACKNOWLEDGED',
        'AGENT_ASSIGNED',
        'EN_ROUTE',
        'NEARBY',
        'DELIVERED',
        'CANCELLED'
      )
    `);

    await queryRunner.query(`
      CREATE TYPE "public"."payment_status_enum" AS ENUM (
        'UNPAID',
        'PAID_BY_HAND'
      )
    `);

    // === CUSTOMERS TABLE ===
    await queryRunner.query(`
      CREATE TABLE "customers" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "phone" character varying(20) NOT NULL,
        "language" character varying(5) NOT NULL DEFAULT 'en',
        "last_active_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_customers_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_customers_phone" UNIQUE ("phone")
      )
    `);

    // === ZONES TABLE ===
    await queryRunner.query(`
      CREATE TABLE "zones" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" character varying(100) NOT NULL,
        "polygon" geography(Polygon,4326),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_zones_id" PRIMARY KEY ("id")
      )
    `);

    // === AGENTS TABLE ===
    await queryRunner.query(`
      CREATE TABLE "agents" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "phone" character varying(20) NOT NULL,
        "full_name" character varying(150) NOT NULL,
        "status" "public"."agent_status_enum" NOT NULL DEFAULT 'PENDING',
        "location" geography(Point,4326),
        "zone_id" uuid,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_agents_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_agents_phone" UNIQUE ("phone"),
        CONSTRAINT "FK_agents_zone_id" FOREIGN KEY ("zone_id") REFERENCES "zones"("id") ON DELETE SET NULL ON UPDATE CASCADE
      )
    `);

    // Explicit spatial GIST index on agents.location (for fast ST_DWithin, ST_Distance queries)
    await queryRunner.query(`
      CREATE INDEX "IDX_agents_location_gist" ON "agents" USING GIST ("location")
    `);

    // === ORDERS TABLE ===
    await queryRunner.query(`
      CREATE TABLE "orders" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "reference" character varying(50) NOT NULL,
        "customer_id" uuid NOT NULL,
        "agent_id" uuid,
        "status" "public"."order_status_enum" NOT NULL DEFAULT 'PENDING',
        "delivery_location" geography(Point,4326) NOT NULL,
        "total_xaf" integer NOT NULL,
        "acknowledged_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_orders_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_orders_reference" UNIQUE ("reference"),
        CONSTRAINT "FK_orders_customer_id" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "FK_orders_agent_id" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE SET NULL ON UPDATE CASCADE
      )
    `);

    // Explicit spatial GIST index on orders.delivery_location
    await queryRunner.query(`
      CREATE INDEX "IDX_orders_delivery_location_gist" ON "orders" USING GIST ("delivery_location")
    `);

    // === PAYMENTS TABLE ===
    await queryRunner.query(`
      CREATE TABLE "payments" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "order_id" uuid NOT NULL,
        "status" "public"."payment_status_enum" NOT NULL DEFAULT 'UNPAID',
        "amount_xaf" integer NOT NULL,
        "cash_collected_by_agent_id" uuid,
        "agent_confirmed_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_payments_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_payments_order_id" UNIQUE ("order_id"),
        CONSTRAINT "FK_payments_order_id" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "FK_payments_cash_collected_by_agent_id" FOREIGN KEY ("cash_collected_by_agent_id") REFERENCES "agents"("id") ON DELETE SET NULL ON UPDATE CASCADE
      )
    `);

    // Optional: additional indexes for common query patterns (performance)
    await queryRunner.query(
      `CREATE INDEX "IDX_orders_status" ON "orders" ("status")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_agents_status" ON "agents" ("status")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_payments_status" ON "payments" ("status")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Reverse order: drop tables with FK dependencies first
    await queryRunner.query(`DROP TABLE IF EXISTS "payments"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "orders"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "agents"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "zones"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "customers"`);

    // Drop ENUM types
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."payment_status_enum"`,
    );
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."order_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."agent_status_enum"`);

    // Drop extensions (optional in production - usually left in place)
    // await queryRunner.query(`DROP EXTENSION IF EXISTS "postgis"`);
    // await queryRunner.query(`DROP EXTENSION IF EXISTS "uuid-ossp"`);
  }
}
