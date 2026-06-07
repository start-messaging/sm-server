import request from 'supertest';
import { registerVerifiedUser } from '../helpers/auth';
import { createTestApp, TestAppContext } from '../helpers/create-test-app';
import { asSuccess } from '../helpers/envelope';

describe('GET /v1/auth/me', () => {
  let ctx: TestAppContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('returns the current user profile without the password hash', async () => {
    const user = await registerVerifiedUser(ctx.app.getHttpServer());

    const res = await request(ctx.app.getHttpServer())
      .get('/v1/auth/me')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .expect(200);

    const body = asSuccess<Record<string, unknown>>(res.body);
    expect(body.data.email).toBe(user.email);
    expect(body.data.status).toBe('active');
    expect(body.data).not.toHaveProperty('passwordHash');
  });

  it('rejects a request without a token with 401', async () => {
    await request(ctx.app.getHttpServer()).get('/v1/auth/me').expect(401);
  });
});
