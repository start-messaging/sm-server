import { getRepositoryToken } from '@nestjs/typeorm';
import request from 'supertest';
import { Repository } from 'typeorm';
import { PlatformRole } from '../../src/admin/enums/platform-role.enum';
import { ServiceCountryRate } from '../../src/services/entities/service-country-rate.entity';
import { createStaff, loginStaff } from '../helpers/admin';
import { createTestApp, TestAppContext } from '../helpers/create-test-app';
import { asError, asSuccess } from '../helpers/envelope';
import { seedCategory, seedCountry, seedService } from '../helpers/reference';

interface RatesView {
  countries: { countryCode: string; rates: unknown[] }[];
}

describe('POST /v1/admin/services/:key/rates/countries (add country)', () => {
  let ctx: TestAppContext;
  let token: string;
  let rateRepo: Repository<ServiceCountryRate>;

  beforeAll(async () => {
    ctx = await createTestApp();
    rateRepo = ctx.app.get<Repository<ServiceCountryRate>>(
      getRepositoryToken(ServiceCountryRate),
    );
    const admin = await createStaff(ctx.app, PlatformRole.SUPER_ADMIN);
    token = await loginStaff(ctx.app.getHttpServer(), admin.email);
  });

  afterAll(async () => {
    await ctx.close();
  });

  const add = (
    service: string,
    body: Record<string, unknown>,
    bearer = token,
  ) =>
    request(ctx.app.getHttpServer())
      .post(`/v1/admin/services/${service}/rates/countries`)
      .set('Authorization', `Bearer ${bearer}`)
      .send(body);

  it('seeds one unpriced rate row per category', async () => {
    const country = await seedCountry(ctx.app);
    const service = await seedService(ctx.app);
    await seedCategory(ctx.app, service, { key: 'marketing', label: 'Mkt' });
    await seedCategory(ctx.app, service, { key: 'utility', label: 'Util' });

    const res = await add(service, { countryCode: country }).expect(201);
    const group = asSuccess<RatesView>(res.body).data.countries.find(
      (c) => c.countryCode === country,
    );
    expect(group?.rates).toHaveLength(2);
    expect(
      await rateRepo.count({
        where: { serviceKey: service, countryCode: country },
      }),
    ).toBe(2);
  });

  it('rejects a country that is already priced with 409 RATE_COUNTRY_EXISTS', async () => {
    const country = await seedCountry(ctx.app);
    const service = await seedService(ctx.app);
    await seedCategory(ctx.app, service, { key: 'marketing', label: 'Mkt' });
    await add(service, { countryCode: country }).expect(201);
    const res = await add(service, { countryCode: country }).expect(409);
    expect(asError(res.body).error.code).toBe('RATE_COUNTRY_EXISTS');
  });

  it('rejects a service with no categories with 422 SERVICE_HAS_NO_CATEGORIES', async () => {
    const country = await seedCountry(ctx.app);
    const service = await seedService(ctx.app);
    const res = await add(service, { countryCode: country }).expect(422);
    expect(asError(res.body).error.code).toBe('SERVICE_HAS_NO_CATEGORIES');
  });

  it('rejects an inactive country with 400 COUNTRY_INACTIVE', async () => {
    const country = await seedCountry(ctx.app, { isActive: false });
    const service = await seedService(ctx.app);
    await seedCategory(ctx.app, service, { key: 'marketing', label: 'Mkt' });
    const res = await add(service, { countryCode: country }).expect(400);
    expect(asError(res.body).error.code).toBe('COUNTRY_INACTIVE');
  });

  it('forbids SUPPORT with 403', async () => {
    const country = await seedCountry(ctx.app);
    const service = await seedService(ctx.app);
    await seedCategory(ctx.app, service, { key: 'marketing', label: 'Mkt' });
    const support = await createStaff(ctx.app, PlatformRole.SUPPORT);
    const supportToken = await loginStaff(
      ctx.app.getHttpServer(),
      support.email,
    );
    await add(service, { countryCode: country }, supportToken).expect(403);
  });
});
