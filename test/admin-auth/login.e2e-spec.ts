import request from 'supertest';
import { PlatformRole } from '../../src/admin/enums/platform-role.enum';
import { createStaff } from '../helpers/admin';
import { createTestApp, TestAppContext } from '../helpers/create-test-app';
import { asError, asSuccess } from '../helpers/envelope';

describe('POST /v1/admin/auth/login', () => {
  let ctx: TestAppContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('logs in a staff member and returns an access token', async () => {
    const staff = await createStaff(ctx.app, PlatformRole.SUPER_ADMIN);

    const res = await request(ctx.app.getHttpServer())
      .post('/v1/admin/auth/login')
      .send({ email: staff.email, password: staff.password })
      .expect(200);

    const body = asSuccess<{
      accessToken: string;
      staff: { platformRole: string };
    }>(res.body);
    expect(body.data.accessToken).toEqual(expect.any(String));
    expect(body.data.staff.platformRole).toBe(PlatformRole.SUPER_ADMIN);
  });

  it('rejects a wrong password with 401 INVALID_CREDENTIALS', async () => {
    const staff = await createStaff(ctx.app, PlatformRole.FINANCE);

    const res = await request(ctx.app.getHttpServer())
      .post('/v1/admin/auth/login')
      .send({ email: staff.email, password: 'wrong-password' })
      .expect(401);
    expect(asError(res.body).error.code).toBe('INVALID_CREDENTIALS');
  });
});
