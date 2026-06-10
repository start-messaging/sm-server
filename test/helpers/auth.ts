import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { asSuccess } from './envelope';
import { seedCountry, seedCurrency } from './reference';

export const DEFAULT_PASSWORD = 'Passw0rd!';

export const uniqueEmail = (prefix: string): string =>
  `${prefix}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}@example.com`;

/** A unique, libphonenumber-valid Indian mobile (+91 9xxxxxxxxx). */
export const uniqueMobileIN = (): string =>
  `+919${String(Math.floor(Math.random() * 1e9)).padStart(9, '0')}`;

/** Ensure the real `IN` country row exists and is active (idempotent upsert). */
export async function ensureCountryIN(app: INestApplication): Promise<void> {
  // Stable real currency, so IN never rides on a generated test code that a
  // sibling file's fresh* helper could later sweep away.
  await seedCurrency(app, { code: 'INR', name: 'Indian Rupee', symbol: '₹' });
  await seedCountry(app, {
    code: 'IN',
    name: 'India',
    dialCode: '+91',
    currencyCode: 'INR',
    isActive: true,
  });
}

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

/**
 * Full onboarding: verified user + mobile set & verified (devCode flow). Needs
 * the app (not just the server) to seed the `IN` country the mobile maps to.
 */
export async function registerOnboardedUser(
  app: INestApplication,
  server: App,
): Promise<RegisteredUser & { mobileE164: string }> {
  await ensureCountryIN(app);
  const user = await registerVerifiedUser(server);
  const mobileE164 = uniqueMobileIN();

  const set = await request(server)
    .post('/v1/auth/mobile')
    .set('Authorization', `Bearer ${user.accessToken}`)
    .send({ mobileE164 })
    .expect(201);
  const { verificationToken, devCode } = asSuccess<{
    verificationToken: string;
    devCode: string;
  }>(set.body).data;

  await request(server)
    .post('/v1/auth/verify-mobile-otp')
    .set('Authorization', `Bearer ${user.accessToken}`)
    .send({ verificationToken, code: devCode })
    .expect(200);

  return { ...user, mobileE164 };
}
