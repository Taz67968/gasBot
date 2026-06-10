import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * AddMissingColumns
 *
 * Adds columns that were in the TypeScript entities but missing from the initial
 * migration DDL, fixes the order_status enum to include WAITING_FOR_SUPPLIER,
 * and clears the agents table so suppliers re-register with the new 2-step flow.
 */
export class AddMissingColumns1749516000000 implements MigrationInterface {
  name = 'AddMissingColumns1749516000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── 1. Add gas_type to agents (was in entity but missing from initial DDL) ──
    await queryRunner.query(`
      ALTER TABLE agents
        ADD COLUMN IF NOT EXISTS gas_type character varying(50)
    `);

    // ── 2. Add bottle_image_media_id to orders (same situation) ──────────────
    await queryRunner.query(`
      ALTER TABLE orders
        ADD COLUMN IF NOT EXISTS bottle_image_media_id character varying(100)
    `);

    // ── 3. Add WAITING_FOR_SUPPLIER to the order_status enum if missing ───────
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_enum
          WHERE enumlabel = 'WAITING_FOR_SUPPLIER'
          AND enumtypid = (
            SELECT oid FROM pg_type WHERE typname = 'order_status_enum'
          )
        ) THEN
          ALTER TYPE "public"."order_status_enum" ADD VALUE 'WAITING_FOR_SUPPLIER';
        END IF;
      END
      $$;
    `);

    // ── 4. Clear agents table (user request: all suppliers re-register) ────────
    // FK constraint on orders.agent_id is SET NULL, so this is safe.
    await queryRunner.query(`TRUNCATE TABLE agents RESTART IDENTITY CASCADE`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Note: removing an enum value in PostgreSQL requires recreating the type.
    // For simplicity only column drops are reversed here.
    await queryRunner.query(`ALTER TABLE agents DROP COLUMN IF EXISTS gas_type`);
    await queryRunner.query(`ALTER TABLE orders DROP COLUMN IF EXISTS bottle_image_media_id`);
  }
}
