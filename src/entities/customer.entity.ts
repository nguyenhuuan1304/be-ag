import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity('customers')
export class Customer {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  customer_number: string;

  @Column()
  customer_name: string;

  @Column()
  email: string;

  @CreateDateColumn()
  created_at: Date;
}
