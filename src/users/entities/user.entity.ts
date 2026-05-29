import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';

@Entity({ name: 'users' })
export class User extends BaseEntity {
  @Index({ unique: true })
  @Column({ type: 'citext' })
  email!: string;

  @Column({ type: 'varchar', length: 120 })
  name!: string;
}
