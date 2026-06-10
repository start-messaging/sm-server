import request from 'supertest';
import { PlatformRole } from '../../src/admin/enums/platform-role.enum';
import { createStaff, loginStaff } from '../helpers/admin';
import { createTestApp, TestAppContext } from '../helpers/create-test-app';
import { asError, asSuccess } from '../helpers/envelope';
import {
  freshCountryCode,
  seedCategory,
  seedCountry,
  seedCurrency,
  seedService,
} from '../helpers/reference';

interface RateProfile {
  categoryKey: string;
  providerCostMicros: number | null;
  sellMicros: number | null;
}

describe('PUT /v1/admin/services/:key/rates/:cc/:cat (upsert rate)', () => {
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

  /** A service with one `marketing` category + a priced-capable country. */
  async function fixture() {
    const currency = await seedCurrency(ctx.app);
    const country = await seedCountry(ctx.app, { currencyCode: currency });
    const service = await seedService(ctx.app);
    await seedCategory(ctx.app, service, { key: 'marketing', label: 'Mkt' });
    return { currency, country, service };
  }

  const put = (
    service: string,
    cc: string,
    cat: string,
    body: Record<string, unknown>,
    bearer = token,
  ) =>
    request(ctx.app.getHttpServer())
      .put(`/v1/admin/services/${service}/rates/${cc}/${cat}`)
      .set('Authorization', `Bearer ${bearer}`)
      .send(body);

  it('creates then updates the same cell (idempotent, 200 both times)', async () => {
    const { currency, country, service } = await fixture();

    const created = await put(service, country, 'marketing', {
      currency,
      providerCostMicros: 600000,
      sellMicros: 900000,
    }).expect(200);
    expect(asSuccess<RateProfile>(created.body).data.sellMicros).toBe(900000);

    const updated = await put(service, country, 'marketing', {
      currency,
      providerCostMicros: 600000,
      sellMicros: 850000,
    }).expect(200);
    expect(asSuccess<RateProfile>(updated.body).data.sellMicros).toBe(850000);
  });

  it('forbids SUPPORT with 403', async () => {
    const { currency, country, service } = await fixture();
    const support = await createStaff(ctx.app, PlatformRole.SUPPORT);
    const supportToken = await loginStaff(
      ctx.app.getHttpServer(),
      support.email,
    );
    await put(
      service,
      country,
      'marketing',
      { currency, sellMicros: 100000 },
      supportToken,
    ).expect(403);
  });

  it('rejects negative micros with 400', async () => {
    const { currency, country, service } = await fixture();
    await put(service, country, 'marketing', {
      currency,
      sellMicros: -1,
    }).expect(400);
  });

  it('rejects non-integer micros with 400', async () => {
    const { currency, country, service } = await fixture();
    await put(service, country, 'marketing', {
      currency,
      sellMicros: 1.5,
    }).expect(400);
  });

  it('rejects a category not in the service with 400 SERVICE_CATEGORY_NOT_FOUND', async () => {
    const { currency, country, service } = await fixture();
    const res = await put(service, country, 'utility', {
      currency,
      sellMicros: 100000,
    }).expect(400);
    expect(asError(res.body).error.code).toBe('SERVICE_CATEGORY_NOT_FOUND');
  });

  it('rejects an unknown country with 400 COUNTRY_NOT_FOUND', async () => {
    const { service } = await fixture();
    const missing = await freshCountryCode(ctx.app);
    const res = await put(service, missing, 'marketing', {
      currency: 'USD',
      sellMicros: 100000,
    }).expect(400);
    expect(asError(res.body).error.code).toBe('COUNTRY_NOT_FOUND');
  });

  it('rejects a currency that does not match the country with 422 RATE_CURRENCY_MISMATCH', async () => {
    const { country, service } = await fixture();
    const otherCurrency = await seedCurrency(ctx.app);
    const res = await put(service, country, 'marketing', {
      currency: otherCurrency,
      sellMicros: 100000,
    }).expect(422);
    expect(asError(res.body).error.code).toBe('RATE_CURRENCY_MISMATCH');
  });
});
