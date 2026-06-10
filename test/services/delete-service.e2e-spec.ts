import { getRepositoryToken } from '@nestjs/typeorm';
import request from 'supertest';
import { Repository } from 'typeorm';
import { PlatformRole } from '../../src/admin/enums/platform-role.enum';
import { ServiceCategory } from '../../src/services/entities/service-category.entity';
import { ServiceCountryRate } from '../../src/services/entities/service-country-rate.entity';
import { createStaff, loginStaff } from '../helpers/admin';
import { createTestApp, TestAppContext } from '../helpers/create-test-app';
import { asError, asSuccess } from '../helpers/envelope';
import {
  freshServiceKey,
  seedCategory,
  seedCountry,
  seedCurrency,
  seedRate,
  seedService,
} from '../helpers/reference';

describe('DELETE /v1/admin/services/:key (remove)', () => {
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

  it('deletes the service (204) and cascade-deletes its categories', async () => {
    const key = await seedService(ctx.app);
    await seedCategory(ctx.app, key, { key: 'marketing', label: 'Marketing' });

    await request(ctx.app.getHttpServer())
      .delete(`/v1/admin/services/${key}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(204);

    // Service is gone from the list…
    const res = await request(ctx.app.getHttpServer())
      .get('/v1/admin/services')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const keys = asSuccess<Array<{ key: string }>>(res.body).data.map(
      (s) => s.key,
    );
    expect(keys).not.toContain(key);

    // …and its categories cascaded.
    const catRepo = ctx.app.get<Repository<ServiceCategory>>(
      getRepositoryToken(ServiceCategory),
    );
    expect(await catRepo.count({ where: { serviceKey: key } })).toBe(0);
  });

  it('cascade-deletes the service country rates', async () => {
    const currency = await seedCurrency(ctx.app);
    const country = await seedCountry(ctx.app, { currencyCode: currency });
    const key = await seedService(ctx.app);
    await seedCategory(ctx.app, key, { key: 'marketing', label: 'Marketing' });
    await seedRate(ctx.app, {
      serviceKey: key,
      countryCode: country,
      categoryKey: 'marketing',
      currency,
      sellMicros: 100000,
    });

    await request(ctx.app.getHttpServer())
      .delete(`/v1/admin/services/${key}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(204);

    const rateRepo = ctx.app.get<Repository<ServiceCountryRate>>(
      getRepositoryToken(ServiceCountryRate),
    );
    expect(await rateRepo.count({ where: { serviceKey: key } })).toBe(0);
  });

  it('returns 404 SERVICE_NOT_FOUND for an unknown key', async () => {
    const res = await request(ctx.app.getHttpServer())
      .delete(`/v1/admin/services/${await freshServiceKey(ctx.app)}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
    expect(asError(res.body).error.code).toBe('SERVICE_NOT_FOUND');
  });

  it('forbids SUPPORT with 403', async () => {
    const key = await seedService(ctx.app);
    const support = await createStaff(ctx.app, PlatformRole.SUPPORT);
    const supportToken = await loginStaff(
      ctx.app.getHttpServer(),
      support.email,
    );
    await request(ctx.app.getHttpServer())
      .delete(`/v1/admin/services/${key}`)
      .set('Authorization', `Bearer ${supportToken}`)
      .expect(403);
  });
});
