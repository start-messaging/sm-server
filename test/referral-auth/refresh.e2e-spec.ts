import request from 'supertest';
import { createTestApp, TestAppContext } from '../helpers/create-test-app';
import { asError, asSuccess } from '../helpers/envelope';
import { registerVerifiedPartner } from '../helpers/referral';

describe('POST /v1/referral/auth/refresh', () => {
  let ctx: TestAppContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('rotates the refresh token and issues a new access token', async () => {
    const partner = await registerVerifiedPartner(ctx.app.getHttpServer());

    const res = await request(ctx.app.getHttpServer())
      .post('/v1/referral/auth/refresh')
      .send({ refreshToken: partner.refreshToken })
      .expect(200);

    const body = asSuccess<{ accessToken: string; refreshToken: string }>(
      res.body,
    );
    expect(body.data.accessToken).toEqual(expect.any(String));
    expect(body.data.refreshToken).not.toBe(partner.refreshToken);

    await request(ctx.app.getHttpServer())
      .post('/v1/referral/auth/refresh')
      .send({ refreshToken: partner.refreshToken })
      .expect(401);
  });

  it('rejects an unknown refresh token with 401 SESSION_INVALID', async () => {
    const res = await request(ctx.app.getHttpServer())
      .post('/v1/referral/auth/refresh')
      .send({ refreshToken: 'not-a-real-token' })
      .expect(401);
    expect(asError(res.body).error.code).toBe('SESSION_INVALID');
  });
});
