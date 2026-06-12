import request from 'supertest';
import { ServiceStatus } from '../../src/services/entities/service.entity';
import { registerOnboardedUser, registerVerifiedUser } from '../helpers/auth';
import { createTestApp, TestAppContext } from '../helpers/create-test-app';
import { asError, asSuccess } from '../helpers/envelope';
import {
  seedCategory,
  seedCountry,
  seedCurrency,
  seedRate,
  seedService,
} from '../helpers/reference';

interface PublicService {
  key: string;
  name: string;
  short: string;
  description: string | null;
  status: string;
  categories: { key: string; label: string; hint: string | null }[];
}

describe('GET /v1/services (available in my country)', () => {
  let ctx: TestAppContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('lists active/beta services priced in the user country, plus coming-soon teasers', async () => {
    // Onboarded user → country IN (helper seeds it).
    const user = await registerOnboardedUser(ctx.app, ctx.app.getHttpServer());

    const currency = await seedCurrency(ctx.app);
    const elsewhere = await seedCountry(ctx.app, { currencyCode: currency });

    const inCountry = async (
      status: ServiceStatus,
      rate: { cc: string; active: boolean } | null,
    ) => {
      const key = await seedService(ctx.app, { status });
      await seedCategory(ctx.app, key, { key: 'default', label: 'Default' });
      if (rate) {
        await seedRate(ctx.app, {
          serviceKey: key,
          countryCode: rate.cc,
          categoryKey: 'default',
          currency,
          isActive: rate.active,
        });
      }
      return key;
    };

    const visible = await inCountry(ServiceStatus.ACTIVE, {
      cc: 'IN',
      active: true,
    });
    const visibleBeta = await inCountry(ServiceStatus.BETA, {
      cc: 'IN',
      active: true,
    });
    const wrongCountry = await inCountry(ServiceStatus.ACTIVE, {
      cc: elsewhere,
      active: true,
    });
    const comingSoon = await inCountry(ServiceStatus.COMING_SOON, {
      cc: 'IN',
      active: true,
    });
    const comingSoonUnpriced = await inCountry(ServiceStatus.COMING_SOON, null);
    const inactiveRate = await inCountry(ServiceStatus.ACTIVE, {
      cc: 'IN',
      active: false,
    });
    const unpriced = await inCountry(ServiceStatus.ACTIVE, null);

    const res = await request(ctx.app.getHttpServer())
      .get('/v1/services')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .expect(200);
    const list = asSuccess<PublicService[]>(res.body).data;
    const keys = list.map((s) => s.key);

    expect(keys).toContain(visible);
    expect(keys).toContain(visibleBeta);
    expect(keys).not.toContain(wrongCountry);
    expect(keys).not.toContain(inactiveRate);
    expect(keys).not.toContain(unpriced);

    // Coming-soon services are ROADMAP TEASERS: always listed (priced or not,
    // any country), flagged by status, AFTER every available service.
    expect(keys).toContain(comingSoon);
    expect(keys).toContain(comingSoonUnpriced);
    expect(list.find((s) => s.key === comingSoonUnpriced)!.status).toBe(
      'coming_soon',
    );
    const lastAvailable = Math.max(
      keys.indexOf(visible),
      keys.indexOf(visibleBeta),
    );
    const firstTeaser = Math.min(
      keys.indexOf(comingSoon),
      keys.indexOf(comingSoonUnpriced),
    );
    expect(lastAvailable).toBeLessThan(firstTeaser);

    // Public shape: categories inlined, no admin-only fields.
    const svc = list.find((s) => s.key === visible)!;
    expect(svc.categories).toEqual([
      expect.objectContaining({ key: 'default', label: 'Default' }),
    ]);
    expect(svc).not.toHaveProperty('provider');
    expect(svc).not.toHaveProperty('pricedCountryCount');
  });

  it('rejects a user without a country with 403 COUNTRY_NOT_SET', async () => {
    const user = await registerVerifiedUser(ctx.app.getHttpServer());
    const res = await request(ctx.app.getHttpServer())
      .get('/v1/services')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .expect(403);
    expect(asError(res.body).error.code).toBe('COUNTRY_NOT_SET');
  });

  it('rejects an unauthenticated request with 401', async () => {
    await request(ctx.app.getHttpServer()).get('/v1/services').expect(401);
  });
});
