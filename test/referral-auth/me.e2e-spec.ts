import request from 'supertest';
import { createTestApp, TestAppContext } from '../helpers/create-test-app';
import { asSuccess } from '../helpers/envelope';
import { registerVerifiedPartner } from '../helpers/referral';

describe('GET /v1/referral/auth/me', () => {
  let ctx: TestAppContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('returns the current partner profile without the password hash', async () => {
    const partner = await registerVerifiedPartner(ctx.app.getHttpServer());

    const res = await request(ctx.app.getHttpServer())
      .get('/v1/referral/auth/me')
      .set('Authorization', `Bearer ${partner.accessToken}`)
      .expect(200);

    const body = asSuccess<Record<string, unknown>>(res.body);
    expect(body.data.email).toBe(partner.email);
    expect(body.data.status).toBe('active');
    expect(body.data).not.toHaveProperty('passwordHash');
  });

  it('rejects a request without a token with 401', async () => {
    await request(ctx.app.getHttpServer())
      .get('/v1/referral/auth/me')
      .expect(401);
  });
});
