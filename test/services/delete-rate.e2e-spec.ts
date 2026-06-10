import { getRepositoryToken } from '@nestjs/typeorm';
import request from 'supertest';
import { Repository } from 'typeorm';
import { PlatformRole } from '../../src/admin/enums/platform-role.enum';
import { ServiceCountryRate } from '../../src/services/entities/service-country-rate.entity';
import { createStaff, loginStaff } from '../helpers/admin';
import { createTestApp, TestAppContext } from '../helpers/create-test-app';
import { asError } from '../helpers/envelope';
import {
  seedCategory,
  seedCountry,
  seedCurrency,
  seedRate,
  seedService,
} from '../helpers/reference';

describe('DELETE /v1/admin/services/:key/rates (remove rate / country)', () => {
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

  /** A service with `marketing` + `utility` priced in one country. */
  async function priced() {
    const currency = await seedCurrency(ctx.app);
    const country = await seedCountry(ctx.app, { currencyCode: currency });
    const service = await seedService(ctx.app);
    for (const key of ['marketing', 'utility']) {
      await seedCategory(ctx.app, service, { key, label: key });
      await seedRate(ctx.app, {
        serviceKey: service,
        countryCode: country,
        categoryKey: key,
        currency,
        sellMicros: 100000,
      });
    }
    return { service, country };
  }

  const del = (path: string, bearer = token) =>
    request(ctx.app.getHttpServer())
      .delete(path)
      .set('Authorization', `Bearer ${bearer}`);

  it('deletes one cell (204) then 404 RATE_NOT_FOUND on repeat', async () => {
    const { service, country } = await priced();
    await del(
      `/v1/admin/services/${service}/rates/${country}/marketing`,
    ).expect(204);
    const res = await del(
      `/v1/admin/services/${service}/rates/${country}/marketing`,
    ).expect(404);
    expect(asError(res.body).error.code).toBe('RATE_NOT_FOUND');
  });

  it('removes a whole country (204), dropping all its rows, then 404', async () => {
    const { service, country } = await priced();
    await del(`/v1/admin/services/${service}/rates/${country}`).expect(204);
    expect(
      await rateRepo.count({
        where: { serviceKey: service, countryCode: country },
      }),
    ).toBe(0);
    const res = await del(
      `/v1/admin/services/${service}/rates/${country}`,
    ).expect(404);
    expect(asError(res.body).error.code).toBe('RATE_COUNTRY_NOT_FOUND');
  });

  it('forbids SUPPORT with 403', async () => {
    const { service, country } = await priced();
    const support = await createStaff(ctx.app, PlatformRole.SUPPORT);
    const supportToken = await loginStaff(
      ctx.app.getHttpServer(),
      support.email,
    );
    await del(
      `/v1/admin/services/${service}/rates/${country}/marketing`,
      supportToken,
    ).expect(403);
  });
});
