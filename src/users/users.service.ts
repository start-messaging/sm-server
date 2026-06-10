import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { AppException } from '../common/exceptions/app.exception';
import { User, UserStatus } from './entities/user.entity';

// Mobile/country are NOT part of registration input — they're derived later by
// the verified mobile step (country comes from the phone, never user input).
export interface CreatePendingUserInput {
  email: string;
  passwordHash: string;
  fullName: string;
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

  async createPending(input: CreatePendingUserInput): Promise<User> {
    const user = this.users.create({
      email: input.email,
      passwordHash: input.passwordHash,
      fullName: input.fullName,
      status: UserStatus.PENDING_VERIFICATION,
    });
    try {
      return await this.users.save(user);
    } catch (err) {
      // Concurrent first signups race past the find-then-create check; the
      // unique email index settles it — the loser gets the normal 409.
      if (
        err instanceof QueryFailedError &&
        (err.driverError as { code?: string }).code === '23505'
      ) {
        throw new AppException(
          { code: 'EMAIL_TAKEN', message: 'Email already registered' },
          409,
        );
      }
      throw err;
    }
  }

  /**
   * Re-stake an unverified registration: the email was never proven owned, so
   * a repeat signup replaces the claimed name/password. Callers guarantee the
   * user is still PENDING_VERIFICATION — status/emailVerified stay untouched.
   */
  async overwritePending(
    id: string,
    input: { passwordHash: string; fullName: string },
  ): Promise<User> {
    const user = await this.getById(id);
    user.passwordHash = input.passwordHash;
    user.fullName = input.fullName;
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

  /* --------------------------- mobile verification --------------------------- */

  /** The user (if any) who has VERIFIED this number — the uniqueness that matters. */
  findByVerifiedMobile(e164: string): Promise<User | null> {
    return this.users.findOne({
      where: { mobileE164: e164, mobileVerified: true },
    });
  }

  /** Stage a (possibly new) mobile number pending SMS verification. */
  async setPendingMobile(
    id: string,
    e164: string,
    countryCode: string,
  ): Promise<User> {
    const user = await this.getById(id);
    user.mobileE164 = e164;
    user.mobileVerified = false;
    user.countryCode = countryCode;
    return this.users.save(user);
  }

  /**
   * Flip the verified flag. The partial unique index on verified mobiles is the
   * final arbiter against duplicate-number races — translate its violation.
   */
  async markMobileVerified(id: string): Promise<User> {
    const user = await this.getById(id);
    user.mobileVerified = true;
    try {
      return await this.users.save(user);
    } catch (err) {
      if (
        err instanceof QueryFailedError &&
        (err.driverError as { code?: string }).code === '23505'
      ) {
        throw new AppException(
          {
            code: 'MOBILE_TAKEN',
            message: 'This mobile number is already in use',
          },
          409,
        );
      }
      throw err;
    }
  }
}
