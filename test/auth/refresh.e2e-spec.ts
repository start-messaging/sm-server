import request from 'supertest';
import { registerVerifiedUser } from '../helpers/auth';
import { createTestApp, TestAppContext } from '../helpers/create-test-app';
import { asError, asSuccess } from '../helpers/envelope';

describe('POST /v1/auth/refresh', () => {
  let ctx: TestAppContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('rotates the refresh token and issues a new access token', async () => {
    const user = await registerVerifiedUser(ctx.app.getHttpServer());

    const res = await request(ctx.app.getHttpServer())
      .post('/v1/auth/refresh')
      .send({ refreshToken: user.refreshToken })
      .expect(200);

    const body = asSuccess<{ accessToken: string; refreshToken: string }>(
      res.body,
    );
    expect(body.data.accessToken).toEqual(expect.any(String));
    expect(body.data.refreshToken).toEqual(expect.any(String));
    expect(body.data.refreshToken).not.toBe(user.refreshToken);

    // The old (rotated) refresh token must no longer work.
    await request(ctx.app.getHttpServer())
      .post('/v1/auth/refresh')
      .send({ refreshToken: user.refreshToken })
      .expect(401);
  });

  it('rejects an unknown refresh token with 401 SESSION_INVALID', async () => {
    const res = await request(ctx.app.getHttpServer())
      .post('/v1/auth/refresh')
      .send({ refreshToken: 'not-a-real-token' })
      .expect(401);
    expect(asError(res.body).error.code).toBe('SESSION_INVALID');
  });
});
