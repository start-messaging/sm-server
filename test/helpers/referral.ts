import request from 'supertest';
import type { App } from 'supertest/types';
import { DEFAULT_PASSWORD, uniqueEmail } from './auth';
import { asSuccess } from './envelope';

export interface RegisteredPartner {
  email: string;
  password: string;
  accessToken: string;
  refreshToken: string;
}

/** Register + verify a referral partner (reading the dev OTP code). */
export async function registerVerifiedPartner(
  server: App,
  email = uniqueEmail('partner'),
): Promise<RegisteredPartner> {
  const reg = await request(server)
    .post('/v1/referral/auth/register')
    .send({ email, password: DEFAULT_PASSWORD, fullName: 'Test Partner' })
    .expect(201);
  const { verificationToken, devCode } = asSuccess<{
    verificationToken: string;
    devCode: string;
  }>(reg.body).data;

  const verify = await request(server)
    .post('/v1/referral/auth/verify-otp')
    .send({ verificationToken, code: devCode })
    .expect(200);
  const tokens = asSuccess<{ accessToken: string; refreshToken: string }>(
    verify.body,
  ).data;

  return {
    email,
    password: DEFAULT_PASSWORD,
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
  };
}
