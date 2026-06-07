import request from 'supertest';
import { registerVerifiedUser } from '../helpers/auth';
import { createTestApp, TestAppContext } from '../helpers/create-test-app';

describe('POST /v1/auth/logout', () => {
  let ctx: TestAppContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('revokes the session so its refresh token stops working', async () => {
    const user = await registerVerifiedUser(ctx.app.getHttpServer());

    await request(ctx.app.getHttpServer())
      .post('/v1/auth/logout')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .expect(204);

    await request(ctx.app.getHttpServer())
      .post('/v1/auth/refresh')
      .send({ refreshToken: user.refreshToken })
      .expect(401);

    // Instant logout: the access token is rejected immediately too.
    await request(ctx.app.getHttpServer())
      .get('/v1/auth/me')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .expect(401);
  });

  it('rejects logout without an access token with 401', async () => {
    await request(ctx.app.getHttpServer()).post('/v1/auth/logout').expect(401);
  });
});
