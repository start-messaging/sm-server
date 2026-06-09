import request from 'supertest';
import { PlatformRole } from '../../src/admin/enums/platform-role.enum';
import { createStaff, loginStaff } from '../helpers/admin';
import { createTestApp, TestAppContext } from '../helpers/create-test-app';
import { asSuccess } from '../helpers/envelope';
import { seedCountry } from '../helpers/reference';

interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}
interface CountryPage {
  items: Array<{ code: string; name: string; isActive: boolean }>;
  meta: PageMeta;
}

describe('GET /v1/admin/countries (list, paginated)', () => {
  let ctx: TestAppContext;
  let token: string;

  beforeAll(async () => {
    ctx = await createTestApp();
    const admin = await createStaff(ctx.app, PlatformRole.SUPER_ADMIN);
    token = await loginStaff(ctx.app.getHttpServer(), admin.email);
    await seedCountry(ctx.app);
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('defaults to page 1, pageSize 20, with page metadata', async () => {
    const res = await request(ctx.app.getHttpServer())
      .get('/v1/admin/countries')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const { items, meta } = asSuccess<CountryPage>(res.body).data;
    expect(items.length).toBeLessThanOrEqual(20);
    expect(meta.page).toBe(1);
    expect(meta.pageSize).toBe(20);
    expect(meta.hasPrev).toBe(false);
    expect(meta.totalPages).toBe(Math.max(1, Math.ceil(meta.total / 20)));
  });

  it('filters by search (code or name)', async () => {
    const code = await seedCountry(ctx.app);
    const res = await request(ctx.app.getHttpServer())
      .get(`/v1/admin/countries?search=${code}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const { items } = asSuccess<CountryPage>(res.body).data;
    expect(items.some((c) => c.code === code)).toBe(true);
  });

  it('filters out inactive countries with activeOnly=true', async () => {
    const inactive = await seedCountry(ctx.app, { isActive: false });
    const res = await request(ctx.app.getHttpServer())
      .get('/v1/admin/countries?activeOnly=true&pageSize=100')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const { items } = asSuccess<CountryPage>(res.body).data;
    expect(items.every((c) => c.isActive)).toBe(true);
    expect(items.some((c) => c.code === inactive)).toBe(false);
  });

  it('rejects invalid pagination params with 400', async () => {
    await request(ctx.app.getHttpServer())
      .get('/v1/admin/countries?pageSize=999')
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
  });

  it('rejects an unauthenticated request with 401', async () => {
    await request(ctx.app.getHttpServer())
      .get('/v1/admin/countries')
      .expect(401);
  });
});
