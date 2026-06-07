import request from 'supertest';
import { DEFAULT_PASSWORD, uniqueEmail } from '../helpers/auth';
import { createTestApp, TestAppContext } from '../helpers/create-test-app';
import { asError, asSuccess } from '../helpers/envelope';
import { registerVerifiedPartner } from '../helpers/referral';

describe('POST /v1/referral/auth/login', () => {
  let ctx: TestAppContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('logs in a verified partner and returns tokens', async () => {
    const partner = await registerVerifiedPartner(ctx.app.getHttpServer());

    const res = await request(ctx.app.getHttpServer())
      .post('/v1/referral/auth/login')
      .send({ email: partner.email, password: partner.password })
      .expect(200);

    const body = asSuccess<{ accessToken: string; refreshToken: string }>(
      res.body,
    );
    expect(body.data.accessToken).toEqual(expect.any(String));
    expect(body.data.refreshToken).toEqual(expect.any(String));
  });

  it('rejects a wrong password with 401 INVALID_CREDENTIALS', async () => {
    const partner = await registerVerifiedPartner(ctx.app.getHttpServer());

    const res = await request(ctx.app.getHttpServer())
      .post('/v1/referral/auth/login')
      .send({ email: partner.email, password: 'wrong-password' })
      .expect(401);
    expect(asError(res.body).error.code).toBe('INVALID_CREDENTIALS');
  });

  it('rejects an unverified partner with 403 PARTNER_NOT_VERIFIED', async () => {
    const email = uniqueEmail('unverified-partner');
    await request(ctx.app.getHttpServer())
      .post('/v1/referral/auth/register')
      .send({ email, password: DEFAULT_PASSWORD, fullName: 'Partner' })
      .expect(201);

    const res = await request(ctx.app.getHttpServer())
      .post('/v1/referral/auth/login')
      .send({ email, password: DEFAULT_PASSWORD })
      .expect(403);
    expect(asError(res.body).error.code).toBe('PARTNER_NOT_VERIFIED');
  });
});
