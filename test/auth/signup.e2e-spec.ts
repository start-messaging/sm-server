import request from 'supertest';
import {
  DEFAULT_PASSWORD,
  registerVerifiedUser,
  uniqueEmail,
} from '../helpers/auth';
import { createTestApp, TestAppContext } from '../helpers/create-test-app';
import { asError, asSuccess } from '../helpers/envelope';

interface OtpIssueBody {
  verificationToken: string;
  expiresInSec: number;
  resendCooldownSec: number;
  devCode?: string;
}

describe('POST /v1/auth/signup', () => {
  let ctx: TestAppContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('creates a pending user and returns a verification token', async () => {
    const res = await request(ctx.app.getHttpServer())
      .post('/v1/auth/signup')
      .send({
        email: uniqueEmail('signup'),
        password: DEFAULT_PASSWORD,
        fullName: 'Jane Doe',
      })
      .expect(201);

    const body = asSuccess<OtpIssueBody>(res.body);
    expect(body.data.verificationToken).toEqual(expect.any(String));
    expect(body.data.devCode).toMatch(/^\d{6}$/);
    expect(body.data.expiresInSec).toBeGreaterThan(0);
    expect(body.data.resendCooldownSec).toBe(0); // pinned in set-test-env
  });

  it('resumes an UNVERIFIED registration: 201, new token+code, new password wins', async () => {
    const email = uniqueEmail('resume');
    const first = await request(ctx.app.getHttpServer())
      .post('/v1/auth/signup')
      .send({ email, password: DEFAULT_PASSWORD, fullName: 'Jane' })
      .expect(201);
    const firstIssue = asSuccess<OtpIssueBody>(first.body).data;

    // Same email again — e.g. the user reloaded the wizard and started over.
    const newPassword = 'NewPassw0rd!';
    const second = await request(ctx.app.getHttpServer())
      .post('/v1/auth/signup')
      .send({ email, password: newPassword, fullName: 'Jane Again' })
      .expect(201);
    const secondIssue = asSuccess<OtpIssueBody>(second.body).data;
    expect(secondIssue.verificationToken).not.toBe(
      firstIssue.verificationToken,
    );
    expect(secondIssue.devCode).toMatch(/^\d{6}$/);

    // The first token was invalidated by the re-signup.
    const stale = await request(ctx.app.getHttpServer())
      .post('/v1/auth/verify-otp')
      .send({
        verificationToken: firstIssue.verificationToken,
        code: firstIssue.devCode,
      })
      .expect(400);
    expect(asError(stale.body).error.code).toBe('OTP_INVALID');

    // The fresh pair verifies and the OVERWRITTEN password is the one that works.
    await request(ctx.app.getHttpServer())
      .post('/v1/auth/verify-otp')
      .send({
        verificationToken: secondIssue.verificationToken,
        code: secondIssue.devCode,
      })
      .expect(200);
    await request(ctx.app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email, password: newPassword })
      .expect(200);
    const oldPw = await request(ctx.app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email, password: DEFAULT_PASSWORD })
      .expect(401);
    expect(asError(oldPw.body).error.code).toBe('INVALID_CREDENTIALS');
  });

  it('rejects a VERIFIED duplicate email with 409 EMAIL_TAKEN', async () => {
    const user = await registerVerifiedUser(ctx.app.getHttpServer());

    const res = await request(ctx.app.getHttpServer())
      .post('/v1/auth/signup')
      .send({ email: user.email, password: DEFAULT_PASSWORD, fullName: 'X' })
      .expect(409);
    expect(asError(res.body).error.code).toBe('EMAIL_TAKEN');
  });

  it('rejects an invalid body with 400 VALIDATION_ERROR', async () => {
    const res = await request(ctx.app.getHttpServer())
      .post('/v1/auth/signup')
      .send({ email: 'not-an-email', password: 'short', fullName: '' })
      .expect(400);
    expect(asError(res.body).error.code).toBe('VALIDATION_ERROR');
  });
});
