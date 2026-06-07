import request from 'supertest';
import { PlatformRole } from '../../src/admin/enums/platform-role.enum';
import { createStaff, loginStaffTokens } from '../helpers/admin';
import { createTestApp, TestAppContext } from '../helpers/create-test-app';
import { asError, asSuccess } from '../helpers/envelope';

describe('POST /v1/admin/auth/refresh', () => {
  let ctx: TestAppContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('rotates the staff refresh token and issues a new access token', async () => {
    const staff = await createStaff(ctx.app, PlatformRole.SUPER_ADMIN);
    const tokens = await loginStaffTokens(ctx.app.getHttpServer(), staff.email);

    const res = await request(ctx.app.getHttpServer())
      .post('/v1/admin/auth/refresh')
      .send({ refreshToken: tokens.refreshToken })
      .expect(200);

    const body = asSuccess<{ accessToken: string; refreshToken: string }>(
      res.body,
    );
    expect(body.data.accessToken).toEqual(expect.any(String));
    expect(body.data.refreshToken).not.toBe(tokens.refreshToken);

    await request(ctx.app.getHttpServer())
      .post('/v1/admin/auth/refresh')
      .send({ refreshToken: tokens.refreshToken })
      .expect(401);
  });

  it('detects refresh-token reuse and revokes the whole session', async () => {
    const server = ctx.app.getHttpServer();
    const staff = await createStaff(ctx.app, PlatformRole.SUPER_ADMIN);
    const tokens = await loginStaffTokens(server, staff.email);

    const first = await request(server)
      .post('/v1/admin/auth/refresh')
      .send({ refreshToken: tokens.refreshToken })
      .expect(200);
    const token2 = asSuccess<{ refreshToken: string }>(first.body).data
      .refreshToken;

    // Replaying the consumed token → theft → 401 ...
    await request(server)
      .post('/v1/admin/auth/refresh')
      .send({ refreshToken: tokens.refreshToken })
      .expect(401);

    // ... and the whole session is revoked: the live token2 no longer works.
    await request(server)
      .post('/v1/admin/auth/refresh')
      .send({ refreshToken: token2 })
      .expect(401);
  });

  it('rejects an unknown refresh token with 401 SESSION_INVALID', async () => {
    const res = await request(ctx.app.getHttpServer())
      .post('/v1/admin/auth/refresh')
      .send({ refreshToken: 'not-a-real-token' })
      .expect(401);
    expect(asError(res.body).error.code).toBe('SESSION_INVALID');
  });
});
