import request from 'supertest';
import { PlatformRole } from '../../src/admin/enums/platform-role.enum';
import { createStaff, loginStaff } from '../helpers/admin';
import { createTestApp, TestAppContext } from '../helpers/create-test-app';
import { asError, asSuccess } from '../helpers/envelope';
import {
  uniqueCountryCode,
  uniqueCurrencyCode,
  seedCurrency,
} from '../helpers/reference';

interface CountryProfile {
  code: string;
  name: string;
  dialCode: string;
  currencyCode: string;
  isActive: boolean;
}

describe('POST /v1/admin/countries (create)', () => {
  let ctx: TestAppContext;
  let token: string;
  let currencyCode: string;

  beforeAll(async () => {
    ctx = await createTestApp();
    const admin = await createStaff(ctx.app, PlatformRole.SUPER_ADMIN);
    token = await loginStaff(ctx.app.getHttpServer(), admin.email);
    currencyCode = await seedCurrency(ctx.app);
  });

  afterAll(async () => {
    await ctx.close();
  });

  const create = (body: Record<string, unknown>, bearer = token) =>
    request(ctx.app.getHttpServer())
      .post('/v1/admin/countries')
      .set('Authorization', `Bearer ${bearer}`)
      .send(body);

  it('lets a SUPER_ADMIN create a country, normalising code to uppercase', async () => {
    const code = uniqueCountryCode().toLowerCase();
    const res = await create({
      code,
      name: 'Testland',
      dialCode: '+998',
      currencyCode,
    }).expect(201);
    const data = asSuccess<CountryProfile>(res.body).data;
    expect(data.code).toBe(code.toUpperCase());
    expect(data.currencyCode).toBe(currencyCode);
    expect(data.isActive).toBe(true);
  });

  it('rejects an unknown currency with 400 CURRENCY_NOT_FOUND', async () => {
    const res = await create({
      code: uniqueCountryCode(),
      name: 'No currency',
      dialCode: '+997',
      currencyCode: uniqueCurrencyCode(),
    }).expect(400);
    expect(asError(res.body).error.code).toBe('CURRENCY_NOT_FOUND');
  });

  it('rejects an inactive currency with 400 CURRENCY_INACTIVE', async () => {
    const inactive = await seedCurrency(ctx.app, { isActive: false });
    const res = await create({
      code: uniqueCountryCode(),
      name: 'Inactive currency',
      dialCode: '+996',
      currencyCode: inactive,
    }).expect(400);
    expect(asError(res.body).error.code).toBe('CURRENCY_INACTIVE');
  });

  it('rejects a duplicate code with 409 COUNTRY_EXISTS', async () => {
    const code = uniqueCountryCode();
    await create({ code, name: 'Dup', dialCode: '+995', currencyCode }).expect(
      201,
    );
    const res = await create({
      code,
      name: 'Dup again',
      dialCode: '+995',
      currencyCode,
    }).expect(409);
    expect(asError(res.body).error.code).toBe('COUNTRY_EXISTS');
  });

  it('rejects a malformed dialCode with 400', async () => {
    await create({
      code: uniqueCountryCode(),
      name: 'Bad dial',
      dialCode: '0091',
      currencyCode,
    }).expect(400);
  });

  it('forbids SUPPORT with 403', async () => {
    const support = await createStaff(ctx.app, PlatformRole.SUPPORT);
    const supportToken = await loginStaff(
      ctx.app.getHttpServer(),
      support.email,
    );
    await create(
      {
        code: uniqueCountryCode(),
        name: 'Nope',
        dialCode: '+994',
        currencyCode,
      },
      supportToken,
    ).expect(403);
  });
});
