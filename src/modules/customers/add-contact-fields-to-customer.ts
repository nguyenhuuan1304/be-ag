import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddContactFieldsToCustomer implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE customer
      ADD contact_person VARCHAR(255) NULL,
      ADD phone_number VARCHAR(20) NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE customer
      DROP COLUMN contact_person,
      DROP COLUMN phone_number
    `);
  }
}
