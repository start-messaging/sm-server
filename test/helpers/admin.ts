import type { INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import request from 'supertest';
import type { App } from 'supertest/types';
import { Repository } from 'typeorm';
import {
  PlatformStaff,
  StaffStatus,
} from '../../src/admin/entities/platform-staff.entity';
import { PlatformRole } from '../../src/admin/enums/platform-role.enum';
import { PasswordService } from '../../src/security/password.service';
import { DEFAULT_PASSWORD, uniqueEmail } from './auth';
import { asSuccess } from './envelope';

export interface SeededStaff {
  email: string;
  password: string;
}

/**
 * Create an ACTIVE staff row directly (staff are normally invited, but tests
 * need a ready-to-login account). Bypasses the invite flow via the repo.
 */
export async function createStaff(
  app: INestApplication,
  role: PlatformRole,
  email = uniqueEmail('staff'),
): Promise<SeededStaff> {
  const repo = app.get<Repository<PlatformStaff>>(
    getRepositoryToken(PlatformStaff),
  );
  const passwords = app.get(PasswordService);
  await repo.save(
    repo.create({
      email,
      passwordHash: await passwords.hash(DEFAULT_PASSWORD),
      fullName: 'Test Staff',
      platformRole: role,
      status: StaffStatus.ACTIVE,
    }),
  );
  return { email, password: DEFAULT_PASSWORD };
}

export async function loginStaff(
  server: App,
  email: string,
  password = DEFAULT_PASSWORD,
): Promise<string> {
  const tokens = await loginStaffTokens(server, email, password);
  return tokens.accessToken;
}

export async function loginStaffTokens(
  server: App,
  email: string,
  password = DEFAULT_PASSWORD,
): Promise<{ accessToken: string; refreshToken: string }> {
  const res = await request(server)
    .post('/v1/admin/auth/login')
    .send({ email, password })
    .expect(200);
  return asSuccess<{ accessToken: string; refreshToken: string }>(res.body)
    .data;
}
