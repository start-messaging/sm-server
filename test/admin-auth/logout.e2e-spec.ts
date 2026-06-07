import request from 'supertest';
import { PlatformRole } from '../../src/admin/enums/platform-role.enum';
import { createStaff, loginStaffTokens } from '../helpers/admin';
import { createTestApp, TestAppContext } from '../helpers/create-test-app';

describe('POST /v1/admin/auth/logout', () => {
  let ctx: TestAppContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('revokes the session: access + refresh both stop working instantly', async () => {
    const staff = await createStaff(ctx.app, PlatformRole.SUPPORT);
    const tokens = await loginStaffTokens(ctx.app.getHttpServer(), staff.email);

    await request(ctx.app.getHttpServer())
      .post('/v1/admin/auth/logout')
      .set('Authorization', `Bearer ${tokens.accessToken}`)
      .expect(204);

    // Instant logout: access token rejected immediately.
    await request(ctx.app.getHttpServer())
      .get('/v1/admin/auth/me')
      .set('Authorization', `Bearer ${tokens.accessToken}`)
      .expect(401);

    // And the refresh token is gone too.
    await request(ctx.app.getHttpServer())
      .post('/v1/admin/auth/refresh')
      .send({ refreshToken: tokens.refreshToken })
      .expect(401);
  });

  it('rejects logout without an access token with 401', async () => {
    await request(ctx.app.getHttpServer())
      .post('/v1/admin/auth/logout')
      .expect(401);
  });
});
