import request from 'supertest';
import { PlatformRole } from '../../src/admin/enums/platform-role.enum';
import { createStaff, loginStaff } from '../helpers/admin';
import { createTestApp, TestAppContext } from '../helpers/create-test-app';
import { asSuccess } from '../helpers/envelope';

describe('GET /v1/admin/auth/me', () => {
  let ctx: TestAppContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('returns the current staff profile', async () => {
    const staff = await createStaff(ctx.app, PlatformRole.SUPPORT);
    const token = await loginStaff(ctx.app.getHttpServer(), staff.email);

    const res = await request(ctx.app.getHttpServer())
      .get('/v1/admin/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const body = asSuccess<{ email: string; platformRole: string }>(res.body);
    expect(body.data.email).toBe(staff.email);
    expect(body.data.platformRole).toBe(PlatformRole.SUPPORT);
    expect(body.data).not.toHaveProperty('passwordHash');
  });

  it('rejects a request without a token with 401', async () => {
    await request(ctx.app.getHttpServer()).get('/v1/admin/auth/me').expect(401);
  });
});
