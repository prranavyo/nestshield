import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';

@Entity('nestshield_metrics')
export class Metric {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  method: string;

  @Column()
  route: string;

  @Column()
  statusCode: number;

  @Column()
  duration: number;

  @CreateDateColumn()
  timestamp: Date;
}
