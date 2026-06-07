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

  it('detects refresh-token reuse and revokes the whole session', async () => {
    const server = ctx.app.getHttpServer();
    const user = await registerVerifiedUser(server);

    // Normal rotation: token1 → token2 (token1 is now consumed).
    const first = await request(server)
      .post('/v1/auth/refresh')
      .send({ refreshToken: user.refreshToken })
      .expect(200);
    const token2 = asSuccess<{ refreshToken: string }>(first.body).data
      .refreshToken;

    // Replaying the consumed token1 is treated as theft → 401 ...
    await request(server)
      .post('/v1/auth/refresh')
      .send({ refreshToken: user.refreshToken })
      .expect(401);

    // ... and the whole session is revoked: the live token2 no longer works.
    await request(server)
      .post('/v1/auth/refresh')
      .send({ refreshToken: token2 })
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
