import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('transactions')
export class Transaction {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar' })
  trref: string;

  @Column({ type: 'varchar' })
  custno: string;

  @Column({ type: 'varchar' })
  custnm: string;

  @Column({ type: 'date', nullable: true })
  tradate: Date | null;

  @Column({ type: 'varchar' })
  currency: string;

  @Column({ type: 'decimal', precision: 15, scale: 2 })
  amount: number;

  @Column({ type: 'varchar' })
  bencust: string;

  @Column({ type: 'text' })
  remark: string;

  @Column({ type: 'varchar', nullable: true })
  contract_number: string | null;

  @Column({ type: 'varchar', nullable: true })
  status: string | null;

  @Column({ type: 'varchar', nullable: true })
  note: string | null;

  @Column({ type: 'date', nullable: true })
  expected_delivery_date: Date | null;

  @Column({ type: 'date', nullable: true })
  expected_declaration_date: Date | null;

  @Column({ type: 'boolean', default: false })
  is_document_added: boolean;

  @Column({ type: 'varchar', nullable: true })
  updated_by: string | null;

  @UpdateDateColumn({ nullable: true })
  updated_at: Date | null;

  @CreateDateColumn()
  created_at: Date;
}
