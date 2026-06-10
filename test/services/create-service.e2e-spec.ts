import request from 'supertest';
import { PlatformRole } from '../../src/admin/enums/platform-role.enum';
import { createStaff, loginStaff } from '../helpers/admin';
import { createTestApp, TestAppContext } from '../helpers/create-test-app';
import { asError, asSuccess } from '../helpers/envelope';
import { freshServiceKey } from '../helpers/reference';

interface ServiceProfile {
  key: string;
  name: string;
  short: string;
  status: string;
  categories: unknown[];
}

describe('POST /v1/admin/services (create)', () => {
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
      .post('/v1/admin/services')
      .set('Authorization', `Bearer ${bearer}`)
      .send(body);

  it('lets a SUPER_ADMIN create a service, normalising the key to a lowercase slug', async () => {
    const key = await freshServiceKey(ctx.app);
    const res = await create({
      key: key.toUpperCase(),
      name: 'Telegram',
      short: 'TG',
      provider: 'Telegram Bot API',
    }).expect(201);
    const data = asSuccess<ServiceProfile>(res.body).data;
    expect(data.key).toBe(key);
    expect(data.short).toBe('TG');
    expect(data.status).toBe('coming_soon'); // default
    expect(data.categories).toEqual([]);
  });

  it('lets an ADMIN create', async () => {
    const adminUser = await createStaff(ctx.app, PlatformRole.ADMIN);
    const adminToken = await loginStaff(
      ctx.app.getHttpServer(),
      adminUser.email,
    );
    await create(
      { key: await freshServiceKey(ctx.app), name: 'By admin', short: 'BA' },
      adminToken,
    ).expect(201);
  });

  it('rejects a duplicate key with 409 SERVICE_EXISTS', async () => {
    const key = await freshServiceKey(ctx.app);
    await create({ key, name: 'Dup', short: 'DP' }).expect(201);
    const res = await create({ key, name: 'Dup again', short: 'DP' }).expect(
      409,
    );
    expect(asError(res.body).error.code).toBe('SERVICE_EXISTS');
  });

  it('rejects an invalid key with 400', async () => {
    await create({ key: '1bad key!', name: 'Bad', short: 'BD' }).expect(400);
  });

  it('rejects a missing required field with 400', async () => {
    await create({ key: await freshServiceKey(ctx.app), short: 'NX' }).expect(
      400,
    );
  });

  it('forbids SUPPORT with 403', async () => {
    const support = await createStaff(ctx.app, PlatformRole.SUPPORT);
    const supportToken = await loginStaff(
      ctx.app.getHttpServer(),
      support.email,
    );
    await create(
      { key: await freshServiceKey(ctx.app), name: 'Nope', short: 'NO' },
      supportToken,
    ).expect(403);
  });

  it('rejects an unauthenticated request with 401', async () => {
    await request(ctx.app.getHttpServer())
      .post('/v1/admin/services')
      .send({ key: await freshServiceKey(ctx.app), name: 'X', short: 'X' })
      .expect(401);
  });
});
