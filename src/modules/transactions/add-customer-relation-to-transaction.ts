import { MigrationInterface, QueryRunner, TableForeignKey } from 'typeorm';

export class AddCustomerRelationToTransaction implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createForeignKey(
      'transaction',
      new TableForeignKey({
        columnNames: ['customerId'],
        referencedTableName: 'customer',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropForeignKey('transaction', 'FK_customerId');
  }
}
