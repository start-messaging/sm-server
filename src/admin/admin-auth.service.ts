import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthSubject } from '../auth-core/auth-subject.enum';
import type { AuthContext, TokenPair } from '../auth-core/auth.types';
import { BaseAuthService } from '../auth-core/base-auth.service';
import { AppException } from '../common/exceptions/app.exception';
import { AppLogger } from '../common/logger/app-logger.service';
import { HashService } from '../security/hash.service';
import { PasswordService } from '../security/password.service';
import { SessionStore } from '../sessions/session-store.service';
import { StaffLoginDto } from './dto/staff-login.dto';
import { PlatformStaff, StaffStatus } from './entities/platform-staff.entity';
import { presentStaff, type StaffProfile } from './staff-profile';
import type { StaffJwtPayload } from './types/staff-jwt-payload';

@Injectable()
export class AdminAuthService extends BaseAuthService<
  PlatformStaff,
  StaffProfile
> {
  protected readonly subject = AuthSubject.STAFF;

  constructor(
    sessions: SessionStore,
    passwords: PasswordService,
    logger: AppLogger,
    @InjectRepository(PlatformStaff)
    private readonly staff: Repository<PlatformStaff>,
    private readonly jwt: JwtService,
    private readonly hash: HashService,
  ) {
    super(sessions, passwords, logger);
  }

  async login(
    dto: StaffLoginDto,
    ctx: AuthContext,
  ): Promise<TokenPair & { staff: StaffProfile }> {
    const { tokens, principal } = await this.authenticate(
      dto.email,
      dto.password,
      ctx,
    );
    return { ...tokens, staff: presentStaff(principal) };
  }

  /** Redeem an invite token: set the password, activate, and log in. */
  async acceptInvite(
    token: string,
    password: string,
    ctx: AuthContext,
  ): Promise<TokenPair & { staff: StaffProfile }> {
    const staff = await this.staff.findOne({
      where: { inviteTokenHash: this.hash.sha256(token) },
    });
    if (
      !staff ||
      !staff.inviteExpiresAt ||
      staff.inviteExpiresAt.getTime() < Date.now()
    ) {
      throw new AppException(
        { code: 'INVITE_INVALID', message: 'Invalid or expired invite' },
        400,
      );
    }
    staff.passwordHash = await this.passwords.hash(password);
    staff.status = StaffStatus.ACTIVE;
    staff.inviteTokenHash = null;
    staff.inviteExpiresAt = null;
    staff.lastLoginAt = new Date();
    await this.staff.save(staff);
    this.logger.log({ event: 'staff.invite_accepted', id: staff.id }, 'Auth');
    const tokens = await this.issueTokens(staff, ctx);
    return { ...tokens, staff: presentStaff(staff) };
  }

  // --- BaseAuthService hooks ---
  protected findByEmail(email: string): Promise<PlatformStaff | null> {
    return this.staff.findOne({ where: { email } });
  }
  protected findById(id: string): Promise<PlatformStaff | null> {
    return this.staff.findOne({ where: { id } });
  }
  protected getPasswordHash(s: PlatformStaff): string | null {
    return s.passwordHash;
  }
  protected isActive(s: PlatformStaff): boolean {
    return s.status === StaffStatus.ACTIVE;
  }
  protected assertLoginable(s: PlatformStaff): void {
    if (s.status !== StaffStatus.ACTIVE) {
      throw new AppException(
        { code: 'ACCOUNT_SUSPENDED', message: 'Account is not active' },
        403,
      );
    }
  }
  protected signAccess(s: PlatformStaff, sid: string): string {
    const payload: StaffJwtPayload = {
      sub: s.id,
      email: s.email,
      typ: 'staff',
      platformRole: s.platformRole,
      sid,
    };
    return this.jwt.sign(payload);
  }
  protected present(s: PlatformStaff): StaffProfile {
    return presentStaff(s);
  }
  protected async onLogin(s: PlatformStaff): Promise<void> {
    s.lastLoginAt = new Date();
    await this.staff.save(s);
  }
}
