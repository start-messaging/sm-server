import request from 'supertest';
import { createTestApp, TestAppContext } from '../helpers/create-test-app';
import { registerVerifiedPartner } from '../helpers/referral';

describe('POST /v1/referral/auth/logout', () => {
  let ctx: TestAppContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('revokes the session: access + refresh both stop working instantly', async () => {
    const partner = await registerVerifiedPartner(ctx.app.getHttpServer());

    await request(ctx.app.getHttpServer())
      .post('/v1/referral/auth/logout')
      .set('Authorization', `Bearer ${partner.accessToken}`)
      .expect(204);

    await request(ctx.app.getHttpServer())
      .get('/v1/referral/auth/me')
      .set('Authorization', `Bearer ${partner.accessToken}`)
      .expect(401);

    await request(ctx.app.getHttpServer())
      .post('/v1/referral/auth/refresh')
      .send({ refreshToken: partner.refreshToken })
      .expect(401);
  });

  it('rejects logout without an access token with 401', async () => {
    await request(ctx.app.getHttpServer())
      .post('/v1/referral/auth/logout')
      .expect(401);
  });
});
