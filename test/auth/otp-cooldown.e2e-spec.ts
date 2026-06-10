// MUST stay the first import: sets OTP_RESEND_COOLDOWN_SEC before
// create-test-app evaluates AppModule (ConfigModule snapshots env at import).
import { TEST_OTP_COOLDOWN_SEC } from '../helpers/enable-otp-cooldown';
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

/**
 * The ONLY spec that runs with a nonzero OTP issue cooldown (the suite pins it
 * to 0 in set-test-env.ts; the enable-otp-cooldown import above overrides it
 * for this file). The serial suite (maxWorkers: 1) makes the process-wide
 * mutation safe, and afterAll restores the pin.
 */
describe('OTP issue cooldown', () => {
  let ctx: TestAppContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    process.env.OTP_RESEND_COOLDOWN_SEC = '0';
    await ctx.close();
  });

  async function signup(): Promise<{ email: string; issue: OtpIssueBody }> {
    const email = uniqueEmail('cooldown');
    const res = await request(ctx.app.getHttpServer())
      .post('/v1/auth/signup')
      .send({ email, password: DEFAULT_PASSWORD, fullName: 'Jane' })
      .expect(201);
    return { email, issue: asSuccess<OtpIssueBody>(res.body).data };
  }

  it('explicit resend within the window: 429 OTP_COOLDOWN with retryAfterSec', async () => {
    const { issue } = await signup();
    expect(issue.resendCooldownSec).toBe(TEST_OTP_COOLDOWN_SEC);

    const res = await request(ctx.app.getHttpServer())
      .post('/v1/auth/resend-otp')
      .send({ verificationToken: issue.verificationToken })
      .expect(429);
    const err = asError(res.body).error;
    expect(err.code).toBe('OTP_COOLDOWN');
    const { retryAfterSec } = err.details as { retryAfterSec: number };
    expect(retryAfterSec).toBeGreaterThan(0);
    expect(retryAfterSec).toBeLessThanOrEqual(TEST_OTP_COOLDOWN_SEC);
  });

  it('re-signup within the window resumes with the SAME token (no 429, no new code)', async () => {
    const { email, issue } = await signup();

    const res = await request(ctx.app.getHttpServer())
      .post('/v1/auth/signup')
      .send({ email, password: 'NewPassw0rd!', fullName: 'Jane Again' })
      .expect(201);
    const reuse = asSuccess<OtpIssueBody>(res.body).data;
    expect(reuse.verificationToken).toBe(issue.verificationToken);
    expect(reuse.devCode).toBeUndefined();

    // The ORIGINAL emailed code still verifies — and the overwritten password
    // is the one that logs in.
    await request(ctx.app.getHttpServer())
      .post('/v1/auth/verify-otp')
      .send({ verificationToken: reuse.verificationToken, code: issue.devCode })
      .expect(200);
    await request(ctx.app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email, password: 'NewPassw0rd!' })
      .expect(200);
  });

  it('unverified login within the window reuses the open token in the recovery details', async () => {
    const { email, issue } = await signup();

    const res = await request(ctx.app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email, password: DEFAULT_PASSWORD })
      .expect(403);
    const err = asError(res.body).error;
    expect(err.code).toBe('USER_NOT_VERIFIED');
    const details = err.details as OtpIssueBody;
    expect(details.verificationToken).toBe(issue.verificationToken);
    expect(details.devCode).toBeUndefined();
  });

  it('set-mobile re-POST within the window: 429, and the first SMS code still verifies', async () => {
    await ensureCountryIN(ctx.app);
    const user = await registerVerifiedUser(ctx.app.getHttpServer());
    const mobileE164 = uniqueMobileIN();

    const set = await request(ctx.app.getHttpServer())
      .post('/v1/auth/mobile')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ mobileE164 })
      .expect(201);
    const first = asSuccess<OtpIssueBody>(set.body).data;

    const retry = await request(ctx.app.getHttpServer())
      .post('/v1/auth/mobile')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ mobileE164: uniqueMobileIN() })
      .expect(429);
    expect(asError(retry.body).error.code).toBe('OTP_COOLDOWN');

    // The throttled attempt invalidated nothing — the first code still works
    // (cooldown is checked BEFORE invalidateOpen).
    await request(ctx.app.getHttpServer())
      .post('/v1/auth/verify-mobile-otp')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ verificationToken: first.verificationToken, code: first.devCode })
      .expect(200);
  });
});
