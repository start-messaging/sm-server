import request from 'supertest';
import { PlatformRole } from '../../src/admin/enums/platform-role.enum';
import { createStaff, loginStaff } from '../helpers/admin';
import { createTestApp, TestAppContext } from '../helpers/create-test-app';
import { asSuccess } from '../helpers/envelope';
import { seedCategory, seedService } from '../helpers/reference';

interface ServiceProfile {
  key: string;
  name: string;
  status: string;
  categories: Array<{ key: string; label: string }>;
}

describe('GET /v1/admin/services (list)', () => {
  let ctx: TestAppContext;
  let token: string;
  let seededKey: string;

  beforeAll(async () => {
    ctx = await createTestApp();
    const admin = await createStaff(ctx.app, PlatformRole.SUPER_ADMIN);
    token = await loginStaff(ctx.app.getHttpServer(), admin.email);
    seededKey = await seedService(ctx.app);
    await seedCategory(ctx.app, seededKey, {
      key: 'marketing',
      label: 'Marketing',
    });
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('returns the catalogue as a plain array with categories inlined', async () => {
    const res = await request(ctx.app.getHttpServer())
      .get('/v1/admin/services')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const data = asSuccess<ServiceProfile[]>(res.body).data;
    expect(Array.isArray(data)).toBe(true);
    const svc = data.find((s) => s.key === seededKey);
    expect(svc).toBeDefined();
    expect(svc?.categories.some((c) => c.key === 'marketing')).toBe(true);
  });

  it('lets any authenticated staff read (SUPPORT)', async () => {
    const support = await createStaff(ctx.app, PlatformRole.SUPPORT);
    const supportToken = await loginStaff(
      ctx.app.getHttpServer(),
      support.email,
    );
    await request(ctx.app.getHttpServer())
      .get('/v1/admin/services')
      .set('Authorization', `Bearer ${supportToken}`)
      .expect(200);
  });

  it('rejects an unauthenticated request with 401', async () => {
    await request(ctx.app.getHttpServer())
      .get('/v1/admin/services')
      .expect(401);
  });
});
