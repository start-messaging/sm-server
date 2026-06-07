import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppException } from '../common/exceptions/app.exception';
import { AppLogger } from '../common/logger/app-logger.service';
import type { EnvVars } from '../config/env.validation';
import { MailerService } from '../mailer/mailer.service';
import { HashService } from '../security/hash.service';
import { CreateStaffDto } from './dto/create-staff.dto';
import { PlatformStaff, StaffStatus } from './entities/platform-staff.entity';
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

  async list(): Promise<StaffProfile[]> {
    const rows = await this.staff.find({ order: { createdAt: 'DESC' } });
    return rows.map(presentStaff);
  }
}
