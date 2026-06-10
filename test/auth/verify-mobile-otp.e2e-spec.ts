import request from 'supertest';
import {
  ensureCountryIN,
  registerVerifiedUser,
  uniqueMobileIN,
} from '../helpers/auth';
import { createTestApp, TestAppContext } from '../helpers/create-test-app';
import { asError, asSuccess } from '../helpers/envelope';

interface SetMobileResult {
  verificationToken: string;
  devCode: string;
}
interface Profile {
  mobileE164: string | null;
  mobileVerified: boolean;
}

describe('POST /v1/auth/verify-mobile-otp (verify mobile)', () => {
  let ctx: TestAppContext;

  beforeAll(async () => {
    ctx = await createTestApp();
    await ensureCountryIN(ctx.app);
  });

  afterAll(async () => {
    await ctx.close();
  });

  /** A verified user with a pending (unverified) mobile + its OTP. */
  async function pendingMobile(mobile = uniqueMobileIN()) {
    const user = await registerVerifiedUser(ctx.app.getHttpServer());
    const res = await request(ctx.app.getHttpServer())
      .post('/v1/auth/mobile')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({ mobileE164: mobile })
      .expect(201);
    const otp = asSuccess<SetMobileResult>(res.body).data;
    return { user, mobile, otp };
  }

  const verify = (bearer: string, verificationToken: string, code: string) =>
    request(ctx.app.getHttpServer())
      .post('/v1/auth/verify-mobile-otp')
      .set('Authorization', `Bearer ${bearer}`)
      .send({ verificationToken, code });

  it('verifies the mobile and returns the updated profile', async () => {
    const { user, mobile, otp } = await pendingMobile();

    const res = await verify(
      user.accessToken,
      otp.verificationToken,
      otp.devCode,
    ).expect(200);
    const profile = asSuccess<Profile>(res.body).data;
    expect(profile.mobileE164).toBe(mobile);
    expect(profile.mobileVerified).toBe(true);

    const meRes = await request(ctx.app.getHttpServer())
      .get('/v1/auth/me')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .expect(200);
    expect(asSuccess<Profile>(meRes.body).data.mobileVerified).toBe(true);
  });

  it('rejects a wrong code with 400 OTP_INVALID', async () => {
    const { user, otp } = await pendingMobile();
    const wrong = otp.devCode === '000000' ? '111111' : '000000';
    const res = await verify(
      user.accessToken,
      otp.verificationToken,
      wrong,
    ).expect(400);
    expect(asError(res.body).error.code).toBe('OTP_INVALID');
  });

  it('locks after too many wrong attempts with 429 OTP_LOCKED', async () => {
    const { user, otp } = await pendingMobile();
    const wrong = otp.devCode === '000000' ? '111111' : '000000';
    // OTP_MAX_ATTEMPTS defaults to 5: burn them all, then expect the lock.
    for (let i = 0; i < 5; i++) {
      await verify(user.accessToken, otp.verificationToken, wrong).expect(400);
    }
    const res = await verify(
      user.accessToken,
      otp.verificationToken,
      wrong,
    ).expect(429);
    expect(asError(res.body).error.code).toBe('OTP_LOCKED');
  });

  it("rejects another user's verification token with 400 OTP_INVALID", async () => {
    const a = await pendingMobile();
    const b = await registerVerifiedUser(ctx.app.getHttpServer());
    const res = await verify(
      b.accessToken,
      a.otp.verificationToken,
      a.otp.devCode,
    ).expect(400);
    expect(asError(res.body).error.code).toBe('OTP_INVALID');
  });

  it('loses the duplicate race with 409 MOBILE_TAKEN', async () => {
    // A and B both stage the SAME number; A verifies first; B must get 409.
    const shared = uniqueMobileIN();
    const a = await pendingMobile(shared);
    const b = await pendingMobile(shared);

    await verify(
      a.user.accessToken,
      a.otp.verificationToken,
      a.otp.devCode,
    ).expect(200);

    const res = await verify(
      b.user.accessToken,
      b.otp.verificationToken,
      b.otp.devCode,
    ).expect(409);
    expect(asError(res.body).error.code).toBe('MOBILE_TAKEN');
  });

  it('rejects an unauthenticated request with 401', async () => {
    await request(ctx.app.getHttpServer())
      .post('/v1/auth/verify-mobile-otp')
      .send({ verificationToken: 'x', code: '123456' })
      .expect(401);
  });
});
