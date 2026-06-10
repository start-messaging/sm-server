import request from 'supertest';
import { registerVerifiedUser } from '../helpers/auth';
import { createTestApp, TestAppContext } from '../helpers/create-test-app';
import { asSuccess } from '../helpers/envelope';
import { seedCountry } from '../helpers/reference';

interface PublicCountry {
  code: string;
  name: string;
  dialCode: string;
}

describe('GET /v1/countries (public picker list)', () => {
  let ctx: TestAppContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('returns active countries in the lean shape, excluding inactive ones', async () => {
    const active = await seedCountry(ctx.app);
    const inactive = await seedCountry(ctx.app, { isActive: false });
    const user = await registerVerifiedUser(ctx.app.getHttpServer());

    const res = await request(ctx.app.getHttpServer())
      .get('/v1/countries')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .expect(200);
    const list = asSuccess<PublicCountry[]>(res.body).data;
    const codes = list.map((c) => c.code);

    expect(codes).toContain(active);
    expect(codes).not.toContain(inactive);

    const row = list.find((c) => c.code === active)!;
    expect(Object.keys(row).sort()).toEqual(['code', 'dialCode', 'name']);
  });

  it('rejects an unauthenticated request with 401', async () => {
    await request(ctx.app.getHttpServer()).get('/v1/countries').expect(401);
  });
});
