import request from 'supertest';
import { PlatformRole } from '../../src/admin/enums/platform-role.enum';
import { createStaff, loginStaff } from '../helpers/admin';
import { createTestApp, TestAppContext } from '../helpers/create-test-app';
import { asError, asSuccess } from '../helpers/envelope';
import {
  freshCountryCode,
  seedCountry,
  seedCurrency,
} from '../helpers/reference';

interface CountryProfile {
  code: string;
  name: string;
  dialCode: string;
  currencyCode: string;
  isActive: boolean;
}

describe('PATCH /v1/admin/countries/:code (update)', () => {
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

  it('updates name, dialCode and deactivates', async () => {
    const code = await seedCountry(ctx.app);
    const res = await request(ctx.app.getHttpServer())
      .patch(`/v1/admin/countries/${code}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Renamed', dialCode: '+993', isActive: false })
      .expect(200);
    const data = asSuccess<CountryProfile>(res.body).data;
    expect(data.name).toBe('Renamed');
    expect(data.dialCode).toBe('+993');
    expect(data.isActive).toBe(false);
  });

  it('switches to another active currency', async () => {
    const code = await seedCountry(ctx.app);
    const next = await seedCurrency(ctx.app);
    const res = await request(ctx.app.getHttpServer())
      .patch(`/v1/admin/countries/${code}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ currencyCode: next })
      .expect(200);
    expect(asSuccess<CountryProfile>(res.body).data.currencyCode).toBe(next);
  });

  it('rejects switching to an inactive currency with 400 CURRENCY_INACTIVE', async () => {
    const code = await seedCountry(ctx.app);
    const inactive = await seedCurrency(ctx.app, { isActive: false });
    const res = await request(ctx.app.getHttpServer())
      .patch(`/v1/admin/countries/${code}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ currencyCode: inactive })
      .expect(400);
    expect(asError(res.body).error.code).toBe('CURRENCY_INACTIVE');
  });

  it('returns 404 COUNTRY_NOT_FOUND for an unknown code', async () => {
    const res = await request(ctx.app.getHttpServer())
      .patch(`/v1/admin/countries/${await freshCountryCode(ctx.app)}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Ghost' })
      .expect(404);
    expect(asError(res.body).error.code).toBe('COUNTRY_NOT_FOUND');
  });

  it('forbids SUPPORT with 403', async () => {
    const code = await seedCountry(ctx.app);
    const support = await createStaff(ctx.app, PlatformRole.SUPPORT);
    const supportToken = await loginStaff(
      ctx.app.getHttpServer(),
      support.email,
    );
    await request(ctx.app.getHttpServer())
      .patch(`/v1/admin/countries/${code}`)
      .set('Authorization', `Bearer ${supportToken}`)
      .send({ name: 'Nope' })
      .expect(403);
  });
});
