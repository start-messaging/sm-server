import request from 'supertest';
import { PlatformRole } from '../../src/admin/enums/platform-role.enum';
import { createStaff, loginStaff } from '../helpers/admin';
import { createTestApp, TestAppContext } from '../helpers/create-test-app';
import { asError, asSuccess } from '../helpers/envelope';
import { freshCurrencyCode, uniqueCurrencyCode } from '../helpers/reference';

interface CurrencyProfile {
  code: string;
  name: string;
  decimalPlaces: number;
  isActive: boolean;
}

describe('POST /v1/admin/currencies (create)', () => {
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

  const create = (body: Record<string, unknown>, bearer = token) =>
    request(ctx.app.getHttpServer())
      .post('/v1/admin/currencies')
      .set('Authorization', `Bearer ${bearer}`)
      .send(body);

  it('lets a SUPER_ADMIN create a currency, normalising code to uppercase', async () => {
    const code = (await freshCurrencyCode(ctx.app)).toLowerCase();
    const res = await create({
      code,
      name: 'Test Coin',
      symbol: '¤',
      decimalPlaces: 0,
    }).expect(201);
    const data = asSuccess<CurrencyProfile>(res.body).data;
    expect(data.code).toBe(code.toUpperCase());
    expect(data.decimalPlaces).toBe(0);
    expect(data.isActive).toBe(true);
  });

  it('defaults decimalPlaces to 2 when omitted', async () => {
    const res = await create({
      code: await freshCurrencyCode(ctx.app),
      name: 'Two Decimals',
      symbol: '¤',
    }).expect(201);
    expect(asSuccess<CurrencyProfile>(res.body).data.decimalPlaces).toBe(2);
  });

  it('rejects a duplicate code with 409 CURRENCY_EXISTS', async () => {
    const code = await freshCurrencyCode(ctx.app);
    await create({ code, name: 'Dup', symbol: '¤' }).expect(201);
    const res = await create({ code, name: 'Dup again', symbol: '¤' }).expect(
      409,
    );
    expect(asError(res.body).error.code).toBe('CURRENCY_EXISTS');
  });

  it('rejects an invalid code with 400', async () => {
    await create({ code: 'US', name: 'Bad', symbol: '¤' }).expect(400);
  });

  it('rejects decimalPlaces out of range with 400', async () => {
    await create({
      code: uniqueCurrencyCode(),
      name: 'Bad',
      symbol: '¤',
      decimalPlaces: 5,
    }).expect(400);
  });

  it('lets an ADMIN create', async () => {
    const adminUser = await createStaff(ctx.app, PlatformRole.ADMIN);
    const adminToken = await loginStaff(
      ctx.app.getHttpServer(),
      adminUser.email,
    );
    await create(
      { code: await freshCurrencyCode(ctx.app), name: 'By admin', symbol: '¤' },
      adminToken,
    ).expect(201);
  });

  it('forbids SUPPORT with 403', async () => {
    const support = await createStaff(ctx.app, PlatformRole.SUPPORT);
    const supportToken = await loginStaff(
      ctx.app.getHttpServer(),
      support.email,
    );
    await create(
      { code: uniqueCurrencyCode(), name: 'Nope', symbol: '¤' },
      supportToken,
    ).expect(403);
  });
});
