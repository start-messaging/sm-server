import request from 'supertest';
import {
  DEFAULT_PASSWORD,
  ensureCountryIN,
  registerVerifiedUser,
  uniqueEmail,
  uniqueMobileIN,
} from '../helpers/auth';
import { createTestApp, TestAppContext } from '../helpers/create-test-app';
import { asError, asSuccess } from '../helpers/envelope';

interface OtpIssueBody {
  verificationToken: string;
  expiresInSec: number;
  resendCooldownSec: number;
  devCode?: string;
}

describe('POST /v1/auth/resend-otp', () => {
  let ctx: TestAppContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.close();
  });

  async function signup(): Promise<{ email: string; issue: OtpIssueBody }> {
    const email = uniqueEmail('resend');
    const res = await request(ctx.app.getHttpServer())
      .post('/v1/auth/signup')
      .send({ email, password: DEFAULT_PASSWORD, fullName: 'Jane' })
      .expect(201);
    return { email, issue: asSuccess<OtpIssueBody>(res.body).data };
  }

  it('issues a fresh code; the old token+code stop working, the new pair verifies', async () => {
    const { issue } = await signup();

    const res = await request(ctx.app.getHttpServer())
      .post('/v1/auth/resend-otp')
      .send({ verificationToken: issue.verificationToken })
      .expect(200);
    const reissued = asSuccess<OtpIssueBody>(res.body).data;
    expect(reissued.verificationToken).not.toBe(issue.verificationToken);
    expect(reissued.devCode).toMatch(/^\d{6}$/);

    const stale = await request(ctx.app.getHttpServer())
      .post('/v1/auth/verify-otp')
      .send({ verificationToken: issue.verificationToken, code: issue.devCode })
      .expect(400);
    expect(asError(stale.body).error.code).toBe('OTP_INVALID');

    await request(ctx.app.getHttpServer())
      .post('/v1/auth/verify-otp')
      .send({
        verificationToken: reissued.verificationToken,
        code: reissued.devCode,
      })
      .expect(200);
  });

  it('the resent (stale) token itself still works as a resend handle', async () => {
    // Tab A resends, tab B still holds the old token and resends too — the new
    // code must reach the same canonical email, never a dead end.
    const { issue } = await signup();
    await request(ctx.app.getHttpServer())
      .post('/v1/auth/resend-otp')
      .send({ verificationToken: issue.verificationToken })
      .expect(200);

    const again = await request(ctx.app.getHttpServer())
      .post('/v1/auth/resend-otp')
      .send({ verificationToken: issue.verificationToken })
      .expect(200);
    expect(asSuccess<OtpIssueBody>(again.body).data.devCode).toMatch(/^\d{6}$/);
  });

  it('rejects an unknown token with 400 OTP_INVALID', async () => {
    const res = await request(ctx.app.getHttpServer())
      .post('/v1/auth/resend-otp')
      .send({ verificationToken: 'a'.repeat(32) })
      .expect(400);
    expect(asError(res.body).error.code).toBe('OTP_INVALID');
  });

  it('rejects resend after the email is verified with 409 EMAIL_ALREADY_VERIFIED', async () => {
    const { issue } = await signup();
    await request(ctx.app.getHttpServer())
      .post('/v1/auth/verify-otp')
      .send({ verificationToken: issue.verificationToken, code: issue.devCode })
      .expect(200);

    const res = await request(ctx.app.getHttpServer())
      .post('/v1/auth/resend-otp')
      .send({ verificationToken: issue.verificationToken })
      .expect(409);
    expect(asError(res.body).error.code).toBe('EMAIL_ALREADY_VERIFIED');
  });

  it('rejects a MOBILE_CHANGE token with 400 OTP_INVALID (email-only endpoint)', async () => {
    await ensureCountryIN(ctx.app);
    const user = await registerVerifiedUser(ctx.app.getHttpServer());
    const set = await request(ctx.app.getHttpServer())
      .post('/v1/auth/mobile')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ mobileE164: uniqueMobileIN() })
      .expect(201);
    const mobileToken = asSuccess<OtpIssueBody>(set.body).data
      .verificationToken;

    const res = await request(ctx.app.getHttpServer())
      .post('/v1/auth/resend-otp')
      .send({ verificationToken: mobileToken })
      .expect(400);
    expect(asError(res.body).error.code).toBe('OTP_INVALID');
  });
});
