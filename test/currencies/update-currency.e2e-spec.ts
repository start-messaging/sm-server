import request from 'supertest';
import { PlatformRole } from '../../src/admin/enums/platform-role.enum';
import { createStaff, loginStaff } from '../helpers/admin';
import { createTestApp, TestAppContext } from '../helpers/create-test-app';
import { asError, asSuccess } from '../helpers/envelope';
import { uniqueCurrencyCode, seedCurrency } from '../helpers/reference';

interface CurrencyProfile {
  code: string;
  name: string;
  decimalPlaces: number;
  isActive: boolean;
}

describe('PATCH /v1/admin/currencies/:code (update)', () => {
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

  it('updates name and deactivates the currency', async () => {
    const code = await seedCurrency(ctx.app);
    const res = await request(ctx.app.getHttpServer())
      .patch(`/v1/admin/currencies/${code}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Renamed', isActive: false })
      .expect(200);
    const data = asSuccess<CurrencyProfile>(res.body).data;
    expect(data.name).toBe('Renamed');
    expect(data.isActive).toBe(false);
  });

  it('returns 404 CURRENCY_NOT_FOUND for an unknown code', async () => {
    const res = await request(ctx.app.getHttpServer())
      .patch(`/v1/admin/currencies/${uniqueCurrencyCode()}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Ghost' })
      .expect(404);
    expect(asError(res.body).error.code).toBe('CURRENCY_NOT_FOUND');
  });

  it('forbids SUPPORT with 403', async () => {
    const code = await seedCurrency(ctx.app);
    const support = await createStaff(ctx.app, PlatformRole.SUPPORT);
    const supportToken = await loginStaff(
      ctx.app.getHttpServer(),
      support.email,
    );
    await request(ctx.app.getHttpServer())
      .patch(`/v1/admin/currencies/${code}`)
      .set('Authorization', `Bearer ${supportToken}`)
      .send({ name: 'Nope' })
      .expect(403);
  });
});
