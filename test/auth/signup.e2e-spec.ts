import request from 'supertest';
import { DEFAULT_PASSWORD, uniqueEmail } from '../helpers/auth';
import { createTestApp, TestAppContext } from '../helpers/create-test-app';
import { asError, asSuccess } from '../helpers/envelope';

describe('POST /v1/auth/signup', () => {
  let ctx: TestAppContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('creates a pending user and returns a verification token', async () => {
    const res = await request(ctx.app.getHttpServer())
      .post('/v1/auth/signup')
      .send({
        email: uniqueEmail('signup'),
        password: DEFAULT_PASSWORD,
        fullName: 'Jane Doe',
      })
      .expect(201);

    const body = asSuccess<{ verificationToken: string; devCode: string }>(
      res.body,
    );
    expect(body.data.verificationToken).toEqual(expect.any(String));
    expect(body.data.devCode).toMatch(/^\d{6}$/);
  });

  it('rejects a duplicate email with 409 EMAIL_TAKEN', async () => {
    const email = uniqueEmail('dup');
    await request(ctx.app.getHttpServer())
      .post('/v1/auth/signup')
      .send({ email, password: DEFAULT_PASSWORD, fullName: 'Jane' })
      .expect(201);

    const res = await request(ctx.app.getHttpServer())
      .post('/v1/auth/signup')
      .send({ email, password: DEFAULT_PASSWORD, fullName: 'Jane' })
      .expect(409);
    expect(asError(res.body).error.code).toBe('EMAIL_TAKEN');
  });

  it('rejects an invalid body with 400 VALIDATION_ERROR', async () => {
    const res = await request(ctx.app.getHttpServer())
      .post('/v1/auth/signup')
      .send({ email: 'not-an-email', password: 'short', fullName: '' })
      .expect(400);
    expect(asError(res.body).error.code).toBe('VALIDATION_ERROR');
  });
});
