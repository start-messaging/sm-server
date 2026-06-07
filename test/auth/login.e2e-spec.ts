import request from 'supertest';
import {
  DEFAULT_PASSWORD,
  registerVerifiedUser,
  uniqueEmail,
} from '../helpers/auth';
import { createTestApp, TestAppContext } from '../helpers/create-test-app';
import { asError, asSuccess } from '../helpers/envelope';

describe('POST /v1/auth/login', () => {
  let ctx: TestAppContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('logs in a verified user and returns tokens', async () => {
    const user = await registerVerifiedUser(ctx.app.getHttpServer());

    const res = await request(ctx.app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email: user.email, password: user.password })
      .expect(200);

    const body = asSuccess<{ accessToken: string; refreshToken: string }>(
      res.body,
    );
    expect(body.data.accessToken).toEqual(expect.any(String));
    expect(body.data.refreshToken).toEqual(expect.any(String));
  });

  it('rejects a wrong password with 401 INVALID_CREDENTIALS', async () => {
    const user = await registerVerifiedUser(ctx.app.getHttpServer());

    const res = await request(ctx.app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email: user.email, password: 'wrong-password' })
      .expect(401);
    expect(asError(res.body).error.code).toBe('INVALID_CREDENTIALS');
  });

  it('rejects an unverified user with 403 USER_NOT_VERIFIED', async () => {
    const email = uniqueEmail('unverified');
    await request(ctx.app.getHttpServer())
      .post('/v1/auth/signup')
      .send({ email, password: DEFAULT_PASSWORD, fullName: 'Jane' })
      .expect(201);

    const res = await request(ctx.app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email, password: DEFAULT_PASSWORD })
      .expect(403);
    expect(asError(res.body).error.code).toBe('USER_NOT_VERIFIED');
  });
});
