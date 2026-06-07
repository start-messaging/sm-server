import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppException } from '../common/exceptions/app.exception';
import { User, UserStatus } from './entities/user.entity';

export interface CreatePendingUserInput {
  email: string;
  passwordHash: string;
  fullName: string;
  mobileE164?: string | null;
  countryCode?: string | null;
}

/**
 * Data access for the `users` table. Users are created through the auth signup
 * (and later invite) flows — there is no public CRUD on users.
 */
@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  findByEmail(email: string): Promise<User | null> {
    return this.users.findOne({ where: { email } });
  }

  findById(id: string): Promise<User | null> {
    return this.users.findOne({ where: { id } });
  }

  async getById(id: string): Promise<User> {
    const user = await this.findById(id);
    if (!user) {
      throw new AppException(
        { code: 'USER_NOT_FOUND', message: `User ${id} not found` },
        404,
      );
    }
    return user;
  }

  createPending(input: CreatePendingUserInput): Promise<User> {
    const user = this.users.create({
      email: input.email,
      passwordHash: input.passwordHash,
      fullName: input.fullName,
      mobileE164: input.mobileE164 ?? null,
      countryCode: input.countryCode ?? null,
      status: UserStatus.PENDING_VERIFICATION,
    });
    return this.users.save(user);
  }

  async markVerified(id: string): Promise<User> {
    const user = await this.getById(id);
    user.emailVerified = true;
    user.status = UserStatus.ACTIVE;
    return this.users.save(user);
  }

  async touchLastLogin(id: string): Promise<void> {
    await this.users.update({ id }, { lastLoginAt: new Date() });
  }
}
