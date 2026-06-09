import request from 'supertest';
import { PlatformRole } from '../../src/admin/enums/platform-role.enum';
import { createStaff, loginStaff } from '../helpers/admin';
import { createTestApp, TestAppContext } from '../helpers/create-test-app';
import { asSuccess } from '../helpers/envelope';

interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}
interface StaffPage {
  items: Array<{ id: string; email: string }>;
  meta: PageMeta;
}

describe('GET /v1/admin/staff (list, paginated)', () => {
  let ctx: TestAppContext;
  let token: string;

  beforeAll(async () => {
    ctx = await createTestApp();
    const admin = await createStaff(ctx.app, PlatformRole.SUPER_ADMIN);
    token = await loginStaff(ctx.app.getHttpServer(), admin.email);
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('defaults to page 1, pageSize 20, with page metadata', async () => {
    const res = await request(ctx.app.getHttpServer())
      .get('/v1/admin/staff')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const { items, meta } = asSuccess<StaffPage>(res.body).data;

    expect(Array.isArray(items)).toBe(true);
    expect(items.length).toBeLessThanOrEqual(20);
    expect(meta.page).toBe(1);
    expect(meta.pageSize).toBe(20);
    expect(meta.hasPrev).toBe(false);
    expect(meta.total).toBeGreaterThanOrEqual(items.length);
    expect(meta.totalPages).toBe(Math.max(1, Math.ceil(meta.total / 20)));
    expect(meta.hasNext).toBe(meta.page < meta.totalPages);
  });

  it('honors page + pageSize query params', async () => {
    const res = await request(ctx.app.getHttpServer())
      .get('/v1/admin/staff?page=2&pageSize=5')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const { items, meta } = asSuccess<StaffPage>(res.body).data;
    expect(meta.page).toBe(2);
    expect(meta.pageSize).toBe(5);
    expect(meta.hasPrev).toBe(true);
    expect(items.length).toBeLessThanOrEqual(5);
  });

  it('rejects invalid pagination params with 400', async () => {
    const server = ctx.app.getHttpServer();
    for (const qs of ['pageSize=0', 'pageSize=999', 'page=0']) {
      await request(server)
        .get(`/v1/admin/staff?${qs}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(400);
    }
  });

  it('forbids a non-SUPER_ADMIN with 403', async () => {
    const support = await createStaff(ctx.app, PlatformRole.SUPPORT);
    const supportToken = await loginStaff(
      ctx.app.getHttpServer(),
      support.email,
    );
    await request(ctx.app.getHttpServer())
      .get('/v1/admin/staff')
      .set('Authorization', `Bearer ${supportToken}`)
      .expect(403);
  });
});
