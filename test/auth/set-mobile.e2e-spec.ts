import request from 'supertest';
import {
  ensureCountryIN,
  registerOnboardedUser,
  registerVerifiedUser,
  uniqueMobileIN,
} from '../helpers/auth';
import { createTestApp, TestAppContext } from '../helpers/create-test-app';
import { asError, asSuccess } from '../helpers/envelope';
import { seedCountry } from '../helpers/reference';

interface SetMobileResult {
  verificationToken: string;
  devCode?: string;
}
interface Profile {
  mobileE164: string | null;
  mobileVerified: boolean;
  countryCode: string | null;
}

describe('POST /v1/auth/mobile (set mobile)', () => {
  let ctx: TestAppContext;

  beforeAll(async () => {
    ctx = await createTestApp();
    await ensureCountryIN(ctx.app);
  });

  afterAll(async () => {
    await ctx.close();
  });

  const setMobile = (bearer: string, mobileE164: string) =>
    request(ctx.app.getHttpServer())
      .post('/v1/auth/mobile')
      .set('Authorization', `Bearer ${bearer}`)
      .send({ mobileE164 });

  const me = (bearer: string) =>
    request(ctx.app.getHttpServer())
      .get('/v1/auth/me')
      .set('Authorization', `Bearer ${bearer}`);

  it('stages the number, derives the country, and returns a devCode', async () => {
    const user = await registerVerifiedUser(ctx.app.getHttpServer());
    const mobile = uniqueMobileIN();

    const res = await setMobile(user.accessToken, mobile).expect(201);
    const data = asSuccess<SetMobileResult>(res.body).data;
    expect(data.verificationToken).toBeTruthy();
    expect(data.devCode).toMatch(/^\d{6}$/);

    const profile = asSuccess<Profile>((await me(user.accessToken)).body).data;
    expect(profile.mobileE164).toBe(mobile);
    expect(profile.countryCode).toBe('IN');
    expect(profile.mobileVerified).toBe(false);
  });

  it('rejects a non-E.164 string with 400 VALIDATION_ERROR', async () => {
    const user = await registerVerifiedUser(ctx.app.getHttpServer());
    await setMobile(user.accessToken, '9876543210').expect(400);
  });

  it('rejects an impossible number with 400 MOBILE_INVALID', async () => {
    const user = await registerVerifiedUser(ctx.app.getHttpServer());
    // Passes the cheap E.164 regex but libphonenumber rejects it (no Indian
    // number pattern matches all-1s), so it must fall to MOBILE_INVALID.
    const res = await setMobile(user.accessToken, '+911111111111').expect(400);
    expect(asError(res.body).error.code).toBe('MOBILE_INVALID');
  });

  it('rejects a number from an inactive country with 400 COUNTRY_NOT_SUPPORTED', async () => {
    await seedCountry(ctx.app, {
      code: 'JP',
      name: 'Japan',
      dialCode: '+81',
      isActive: false,
    });
    const user = await registerVerifiedUser(ctx.app.getHttpServer());
    // A valid Japanese mobile (090-xxxx-xxxx).
    const res = await setMobile(user.accessToken, '+819012345678').expect(400);
    expect(asError(res.body).error.code).toBe('COUNTRY_NOT_SUPPORTED');
  });

  it("rejects another user's verified number with 409 MOBILE_TAKEN", async () => {
    const owner = await registerOnboardedUser(ctx.app, ctx.app.getHttpServer());
    const intruder = await registerVerifiedUser(ctx.app.getHttpServer());
    const res = await setMobile(intruder.accessToken, owner.mobileE164).expect(
      409,
    );
    expect(asError(res.body).error.code).toBe('MOBILE_TAKEN');
  });

  it('rejects changing an already-verified mobile with 409 MOBILE_ALREADY_VERIFIED', async () => {
    const user = await registerOnboardedUser(ctx.app, ctx.app.getHttpServer());
    const res = await setMobile(user.accessToken, uniqueMobileIN()).expect(409);
    expect(asError(res.body).error.code).toBe('MOBILE_ALREADY_VERIFIED');
  });

  it('re-POSTing while unverified overwrites the number and kills the old code', async () => {
    const user = await registerVerifiedUser(ctx.app.getHttpServer());

    const first = await setMobile(user.accessToken, uniqueMobileIN()).expect(
      201,
    );
    const firstData = asSuccess<SetMobileResult>(first.body).data;

    const secondMobile = uniqueMobileIN();
    await setMobile(user.accessToken, secondMobile).expect(201);

    // The first token is now consumed — it must not verify the new number.
    const replay = await request(ctx.app.getHttpServer())
      .post('/v1/auth/verify-mobile-otp')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .send({
        verificationToken: firstData.verificationToken,
        code: firstData.devCode,
      })
      .expect(400);
    expect(asError(replay.body).error.code).toBe('OTP_INVALID');

    const profile = asSuccess<Profile>((await me(user.accessToken)).body).data;
    expect(profile.mobileE164).toBe(secondMobile);
  });

  it('rejects an unauthenticated request with 401', async () => {
    await request(ctx.app.getHttpServer())
      .post('/v1/auth/mobile')
      .send({ mobileE164: uniqueMobileIN() })
      .expect(401);
  });
});
