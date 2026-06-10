import request from 'supertest';
import { PlatformRole } from '../../src/admin/enums/platform-role.enum';
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

interface RatesView {
  service: { key: string; categories: { key: string }[] };
  countries: {
    countryCode: string;
    currency: string;
    currencyDecimalPlaces: number;
    rates: { categoryKey: string; sellMicros: number | null }[];
  }[];
}

describe('GET /v1/admin/services/:key/rates (list rates)', () => {
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

  it('returns the grouped per-country view (readable by any staff)', async () => {
    const currency = await seedCurrency(ctx.app);
    const country = await seedCountry(ctx.app, { currencyCode: currency });
    const service = await seedService(ctx.app);
    await seedCategory(ctx.app, service, { key: 'marketing', label: 'Mkt' });
    await seedRate(ctx.app, {
      serviceKey: service,
      countryCode: country,
      categoryKey: 'marketing',
      currency,
      providerCostMicros: 600000,
      sellMicros: 900000,
    });

    const support = await createStaff(ctx.app, PlatformRole.SUPPORT);
    const supportToken = await loginStaff(
      ctx.app.getHttpServer(),
      support.email,
    );

    const res = await request(ctx.app.getHttpServer())
      .get(`/v1/admin/services/${service}/rates`)
      .set('Authorization', `Bearer ${supportToken}`)
      .expect(200);

    const view = asSuccess<RatesView>(res.body).data;
    expect(view.service.key).toBe(service);
    const group = view.countries.find((c) => c.countryCode === country);
    expect(group).toBeDefined();
    expect(group!.currency).toBe(currency);
    expect(group!.rates).toEqual([
      expect.objectContaining({ categoryKey: 'marketing', sellMicros: 900000 }),
    ]);
  });

  it('returns 404 SERVICE_NOT_FOUND for an unknown service', async () => {
    const res = await request(ctx.app.getHttpServer())
      .get(`/v1/admin/services/${await freshServiceKey(ctx.app)}/rates`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
    expect(asError(res.body).error.code).toBe('SERVICE_NOT_FOUND');
  });
});
