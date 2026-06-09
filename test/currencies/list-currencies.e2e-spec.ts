import request from 'supertest';
import { PlatformRole } from '../../src/admin/enums/platform-role.enum';
import { createStaff, loginStaff } from '../helpers/admin';
import { createTestApp, TestAppContext } from '../helpers/create-test-app';
import { asSuccess } from '../helpers/envelope';
import { seedCurrency } from '../helpers/reference';

interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}
interface CurrencyPage {
  items: Array<{ code: string; decimalPlaces: number; isActive: boolean }>;
  meta: PageMeta;
}

describe('GET /v1/admin/currencies (list, paginated)', () => {
  let ctx: TestAppContext;
  let token: string;

  beforeAll(async () => {
    ctx = await createTestApp();
    const admin = await createStaff(ctx.app, PlatformRole.SUPER_ADMIN);
    token = await loginStaff(ctx.app.getHttpServer(), admin.email);
    await seedCurrency(ctx.app);
    await seedCurrency(ctx.app);
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('defaults to page 1, pageSize 20, with page metadata', async () => {
    const res = await request(ctx.app.getHttpServer())
      .get('/v1/admin/currencies')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const { items, meta } = asSuccess<CurrencyPage>(res.body).data;

    expect(Array.isArray(items)).toBe(true);
    expect(items.length).toBeLessThanOrEqual(20);
    expect(meta.page).toBe(1);
    expect(meta.pageSize).toBe(20);
    expect(meta.hasPrev).toBe(false);
    expect(meta.total).toBeGreaterThanOrEqual(items.length);
    expect(meta.totalPages).toBe(Math.max(1, Math.ceil(meta.total / 20)));
  });

  it('honors page + pageSize query params', async () => {
    const res = await request(ctx.app.getHttpServer())
      .get('/v1/admin/currencies?page=1&pageSize=1')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const { items, meta } = asSuccess<CurrencyPage>(res.body).data;
    expect(meta.pageSize).toBe(1);
    expect(items.length).toBeLessThanOrEqual(1);
  });

  it('rejects invalid pagination params with 400', async () => {
    const server = ctx.app.getHttpServer();
    for (const qs of ['pageSize=0', 'pageSize=999', 'page=0']) {
      await request(server)
        .get(`/v1/admin/currencies?${qs}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(400);
    }
  });

  it('lets any authenticated staff read (SUPPORT)', async () => {
    const support = await createStaff(ctx.app, PlatformRole.SUPPORT);
    const supportToken = await loginStaff(
      ctx.app.getHttpServer(),
      support.email,
    );
    await request(ctx.app.getHttpServer())
      .get('/v1/admin/currencies')
      .set('Authorization', `Bearer ${supportToken}`)
      .expect(200);
  });

  it('rejects an unauthenticated request with 401', async () => {
    await request(ctx.app.getHttpServer())
      .get('/v1/admin/currencies')
      .expect(401);
  });
});
