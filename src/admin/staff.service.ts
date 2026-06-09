import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthSubject } from '../auth-core/auth-subject.enum';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { AppException } from '../common/exceptions/app.exception';
import { AppLogger } from '../common/logger/app-logger.service';
import { paginate, type Paginated } from '../common/types/pagination';
import type { EnvVars } from '../config/env.validation';
import { MailerService } from '../mailer/mailer.service';
import { HashService } from '../security/hash.service';
import { SessionStore } from '../sessions/session-store.service';
import { CreateStaffDto } from './dto/create-staff.dto';
import { UpdateStaffDto } from './dto/update-staff.dto';
import { PlatformStaff, StaffStatus } from './entities/platform-staff.entity';
import { PlatformRole } from './enums/platform-role.enum';
import { presentStaff, type StaffProfile } from './staff-profile';

const INVITE_TTL_DAYS = 7;

@Injectable()
export class StaffService {
  constructor(
    @InjectRepository(PlatformStaff)
    private readonly staff: Repository<PlatformStaff>,
    private readonly hash: HashService,
    private readonly mailer: MailerService,
    private readonly logger: AppLogger,
    private readonly config: ConfigService<EnvVars, true>,
    private readonly sessions: SessionStore,
  ) {}

  /** SUPER_ADMIN invites a staff member; they set their password via the token. */
  async invite(
    dto: CreateStaffDto,
  ): Promise<{ staff: StaffProfile; inviteToken?: string }> {
    const existing = await this.staff.findOne({ where: { email: dto.email } });
    if (existing) {
      throw new AppException(
        { code: 'STAFF_EMAIL_TAKEN', message: 'Email already in use' },
        409,
      );
    }
    const inviteToken = this.hash.randomToken(32);
    const saved = await this.staff.save(
      this.staff.create({
        email: dto.email,
        fullName: dto.fullName,
        platformRole: dto.platformRole,
        status: StaffStatus.INVITED,
        passwordHash: null,
        inviteTokenHash: this.hash.sha256(inviteToken),
        inviteExpiresAt: new Date(Date.now() + INVITE_TTL_DAYS * 86_400_000),
      }),
    );
    await this.mailer.sendStaffInvite(saved.email, inviteToken);
    this.logger.log(
      { event: 'staff.invited', id: saved.id, role: saved.platformRole },
      'Admin',
    );
    const isProd =
      this.config.get('NODE_ENV', { infer: true }) === 'production';
    return { staff: presentStaff(saved), ...(isProd ? {} : { inviteToken }) };
  }

  async list(query: PaginationQueryDto): Promise<Paginated<StaffProfile>> {
    const [rows, total] = await this.staff.findAndCount({
      order: { createdAt: 'DESC' },
      skip: query.skip,
      take: query.take,
    });
    return paginate(rows.map(presentStaff), total, query);
  }

  /** Change a staff member's role and/or active status. SUPER_ADMIN only. */
  async update(
    actingStaffId: string,
    targetId: string,
    dto: UpdateStaffDto,
  ): Promise<StaffProfile> {
    if (dto.platformRole === undefined && dto.status === undefined) {
      throw new AppException(
        { code: 'VALIDATION_ERROR', message: 'Nothing to update' },
        400,
      );
    }
    const target = await this.getTarget(actingStaffId, targetId);

    const newRole = dto.platformRole ?? target.platformRole;
    const newStatus = dto.status ?? target.status;
    // Guard the platform against losing its last way in.
    const wasActiveSuperAdmin =
      target.platformRole === PlatformRole.SUPER_ADMIN &&
      target.status === StaffStatus.ACTIVE;
    const willBeActiveSuperAdmin =
      newRole === PlatformRole.SUPER_ADMIN && newStatus === StaffStatus.ACTIVE;
    if (wasActiveSuperAdmin && !willBeActiveSuperAdmin) {
      await this.assertNotLastActiveSuperAdmin();
    }

    const changed =
      newRole !== target.platformRole || newStatus !== target.status;
    target.platformRole = newRole;
    target.status = newStatus;
    const saved = await this.staff.save(target);

    // The access token carries the role, so revoking sessions makes a role
    // change (and a suspend) take effect immediately rather than at expiry.
    if (changed) {
      await this.sessions.revokeAllForSubject(AuthSubject.STAFF, saved.id);
    }
    this.logger.log(
      {
        event: 'staff.updated',
        id: saved.id,
        role: saved.platformRole,
        status: saved.status,
      },
      'Admin',
    );
    return presentStaff(saved);
  }

  /** Soft-delete a staff member and revoke their sessions. SUPER_ADMIN only. */
  async remove(actingStaffId: string, targetId: string): Promise<void> {
    const target = await this.getTarget(actingStaffId, targetId);
    if (
      target.platformRole === PlatformRole.SUPER_ADMIN &&
      target.status === StaffStatus.ACTIVE
    ) {
      await this.assertNotLastActiveSuperAdmin();
    }
    await this.staff.softRemove(target);
    await this.sessions.revokeAllForSubject(AuthSubject.STAFF, target.id);
    this.logger.log({ event: 'staff.removed', id: target.id }, 'Admin');
  }

  /** Load a non-deleted target, rejecting self-modification. */
  private async getTarget(
    actingStaffId: string,
    targetId: string,
  ): Promise<PlatformStaff> {
    const target = await this.staff.findOne({ where: { id: targetId } });
    if (!target) {
      throw new AppException(
        { code: 'STAFF_NOT_FOUND', message: 'Staff member not found' },
        404,
      );
    }
    if (target.id === actingStaffId) {
      throw new AppException(
        {
          code: 'STAFF_SELF_ACTION',
          message: 'You cannot modify your own account here',
        },
        400,
      );
    }
    return target;
  }

  private async assertNotLastActiveSuperAdmin(): Promise<void> {
    const count = await this.staff.count({
      where: {
        platformRole: PlatformRole.SUPER_ADMIN,
        status: StaffStatus.ACTIVE,
      },
    });
    if (count <= 1) {
      throw new AppException(
        {
          code: 'STAFF_LAST_SUPER_ADMIN',
          message: 'Cannot remove or demote the last active SUPER_ADMIN',
        },
        400,
      );
    }
  }
}
