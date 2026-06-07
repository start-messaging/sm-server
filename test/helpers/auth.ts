import request from 'supertest';
import type { App } from 'supertest/types';
import { asSuccess } from './envelope';

export const DEFAULT_PASSWORD = 'Passw0rd!';

export const uniqueEmail = (prefix: string): string =>
  `${prefix}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}@example.com`;

export interface RegisteredUser {
  email: string;
  password: string;
  accessToken: string;
  refreshToken: string;
}

/** Signup + verify-OTP (reading the dev code from the response) → active user. */
export async function registerVerifiedUser(
  server: App,
  email = uniqueEmail('user'),
): Promise<RegisteredUser> {
  const signup = await request(server)
    .post('/v1/auth/signup')
    .send({ email, password: DEFAULT_PASSWORD, fullName: 'Test User' })
    .expect(201);
  const { verificationToken, devCode } = asSuccess<{
    verificationToken: string;
    devCode: string;
  }>(signup.body).data;

  const verify = await request(server)
    .post('/v1/auth/verify-otp')
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
