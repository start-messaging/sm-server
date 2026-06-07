import request from 'supertest';
import { DEFAULT_PASSWORD, uniqueEmail } from '../helpers/auth';
import { createTestApp, TestAppContext } from '../helpers/create-test-app';
import { asError, asSuccess } from '../helpers/envelope';

describe('POST /v1/referral/auth/register', () => {
  let ctx: TestAppContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('creates a pending partner and returns a verification token', async () => {
    const res = await request(ctx.app.getHttpServer())
      .post('/v1/referral/auth/register')
      .send({
        email: uniqueEmail('partner'),
        password: DEFAULT_PASSWORD,
        fullName: 'Partner One',
      })
      .expect(201);

    const body = asSuccess<{ verificationToken: string; devCode: string }>(
      res.body,
    );
    expect(body.data.verificationToken).toEqual(expect.any(String));
    expect(body.data.devCode).toMatch(/^\d{6}$/);
  });

  it('rejects a duplicate email with 409 EMAIL_TAKEN', async () => {
    const email = uniqueEmail('dup-partner');
    await request(ctx.app.getHttpServer())
      .post('/v1/referral/auth/register')
      .send({ email, password: DEFAULT_PASSWORD, fullName: 'Dup' })
      .expect(201);

    const res = await request(ctx.app.getHttpServer())
      .post('/v1/referral/auth/register')
      .send({ email, password: DEFAULT_PASSWORD, fullName: 'Dup' })
      .expect(409);
    expect(asError(res.body).error.code).toBe('EMAIL_TAKEN');
  });

  it('rejects an invalid body with 400', async () => {
    const res = await request(ctx.app.getHttpServer())
      .post('/v1/referral/auth/register')
      .send({ email: 'nope', password: 'short', fullName: '' })
      .expect(400);
    expect(asError(res.body).error.code).toBe('VALIDATION_ERROR');
  });
});
