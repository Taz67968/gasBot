import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDeliveryAddressText1749600000000 implements MigrationInterface {
  name = 'AddDeliveryAddressText1749600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE orders
        ADD COLUMN IF NOT EXISTS delivery_address_text character varying(500)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE orders DROP COLUMN IF EXISTS delivery_address_text`,
    );
  }
}
