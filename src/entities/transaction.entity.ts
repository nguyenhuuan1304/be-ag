import { Entity, Column, PrimaryGeneratedColumn, ManyToOne } from 'typeorm';
import { Customer } from './customer.entity';

@Entity()
export class Transaction {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  trref: string;

  @Column()
  custno: string;

  @Column()
  custnm: string;

  @Column({ type: 'date', nullable: true })
  tradate: Date | null;

  @Column()
  currency: string;

  @Column('float')
  amount: number;

  @Column()
  bencust: string;

  @Column({ nullable: true })
  remark: string;

  @Column({ nullable: true })
  contract_number: string;

  @Column({ type: 'date', nullable: true })
  expected_declaration_date: Date | null;

  @Column()
  status: string;

  @Column({ default: false })
  is_document_added: boolean;

  @Column({ default: false })
  is_send_email: boolean;

  @Column({ default: false })
  is_sending_email: boolean;

  @Column({ nullable: true })
  note: string;

  @Column({ nullable: true })
  updated_by: string;

  @Column({ type: 'timestamp', nullable: true })
  updated_at: Date;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  created_at: Date;

  @ManyToOne(() => Customer, (customer) => customer.transactions)
  customer: Customer;
}
