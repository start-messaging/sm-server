import request from 'supertest';
import { PlatformRole } from '../../src/admin/enums/platform-role.enum';
import { createStaff, loginStaff } from '../helpers/admin';
import { createTestApp, TestAppContext } from '../helpers/create-test-app';
import { asError, asSuccess } from '../helpers/envelope';
import {
  freshServiceKey,
  seedCategory,
  seedService,
} from '../helpers/reference';

interface CategoryProfile {
  key: string;
  label: string;
  hint: string | null;
}

describe('Service categories sub-resource (/v1/admin/services/:key/categories)', () => {
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

  it('adds a category to a service (201)', async () => {
    const key = await seedService(ctx.app);
    const res = await request(ctx.app.getHttpServer())
      .post(`/v1/admin/services/${key}/categories`)
      .set('Authorization', `Bearer ${token}`)
      .send({ key: 'marketing', label: 'Marketing', hint: 'Promos' })
      .expect(201);
    const data = asSuccess<CategoryProfile>(res.body).data;
    expect(data.key).toBe('marketing');
    expect(data.label).toBe('Marketing');
    expect(data.hint).toBe('Promos');
  });

  it('rejects a duplicate category key with 409 SERVICE_CATEGORY_EXISTS', async () => {
    const key = await seedService(ctx.app);
    await seedCategory(ctx.app, key, { key: 'utility', label: 'Utility' });
    const res = await request(ctx.app.getHttpServer())
      .post(`/v1/admin/services/${key}/categories`)
      .set('Authorization', `Bearer ${token}`)
      .send({ key: 'utility', label: 'Utility again' })
      .expect(409);
    expect(asError(res.body).error.code).toBe('SERVICE_CATEGORY_EXISTS');
  });

  it('returns 404 SERVICE_NOT_FOUND adding to an unknown service', async () => {
    const res = await request(ctx.app.getHttpServer())
      .post(`/v1/admin/services/${await freshServiceKey(ctx.app)}/categories`)
      .set('Authorization', `Bearer ${token}`)
      .send({ key: 'marketing', label: 'Marketing' })
      .expect(404);
    expect(asError(res.body).error.code).toBe('SERVICE_NOT_FOUND');
  });

  it('updates a category (200)', async () => {
    const key = await seedService(ctx.app);
    await seedCategory(ctx.app, key, { key: 'marketing', label: 'Marketing' });
    const res = await request(ctx.app.getHttpServer())
      .patch(`/v1/admin/services/${key}/categories/marketing`)
      .set('Authorization', `Bearer ${token}`)
      .send({ label: 'Promotions', hint: 'Offers' })
      .expect(200);
    const data = asSuccess<CategoryProfile>(res.body).data;
    expect(data.label).toBe('Promotions');
    expect(data.hint).toBe('Offers');
  });

  it('returns 404 SERVICE_CATEGORY_NOT_FOUND for an unknown category', async () => {
    const key = await seedService(ctx.app);
    const res = await request(ctx.app.getHttpServer())
      .patch(`/v1/admin/services/${key}/categories/ghost`)
      .set('Authorization', `Bearer ${token}`)
      .send({ label: 'Nope' })
      .expect(404);
    expect(asError(res.body).error.code).toBe('SERVICE_CATEGORY_NOT_FOUND');
  });

  it('removes a category (204) — gone from the service', async () => {
    const key = await seedService(ctx.app);
    await seedCategory(ctx.app, key, { key: 'marketing', label: 'Marketing' });
    await request(ctx.app.getHttpServer())
      .delete(`/v1/admin/services/${key}/categories/marketing`)
      .set('Authorization', `Bearer ${token}`)
      .expect(204);

    const res = await request(ctx.app.getHttpServer())
      .get('/v1/admin/services')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const svc = asSuccess<
      Array<{ key: string; categories: Array<{ key: string }> }>
    >(res.body).data.find((s) => s.key === key);
    expect(svc?.categories.some((c) => c.key === 'marketing')).toBe(false);
  });

  it('forbids SUPPORT with 403', async () => {
    const key = await seedService(ctx.app);
    const support = await createStaff(ctx.app, PlatformRole.SUPPORT);
    const supportToken = await loginStaff(
      ctx.app.getHttpServer(),
      support.email,
    );
    await request(ctx.app.getHttpServer())
      .post(`/v1/admin/services/${key}/categories`)
      .set('Authorization', `Bearer ${supportToken}`)
      .send({ key: 'marketing', label: 'Marketing' })
      .expect(403);
  });
});
