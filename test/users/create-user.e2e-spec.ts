import request from 'supertest';
import { createTestApp, TestAppContext } from '../helpers/create-test-app';
import { asError, asSuccess } from '../helpers/envelope';

describe('POST /v1/users', () => {
  let ctx: TestAppContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('creates a user and returns the success envelope', async () => {
    const res = await request(ctx.app.getHttpServer())
      .post('/v1/users')
      .send({})
      .expect(201);
    const body = asSuccess<{ id: number; message: string }>(res.body);

    expect(body.data).toEqual({ id: 99, message: 'created' });
    expect(body.meta.requestId).toEqual(expect.any(String));
    expect(res.headers['x-request-id']).toBe(body.meta.requestId);
  });

  it('returns a 400 validation envelope when extra fields are sent', async () => {
    const res = await request(ctx.app.getHttpServer())
      .post('/v1/users')
      .send({ unexpected: 'field' })
      .expect(400);
    const body = asError(res.body);

    expect(body).toMatchObject({
      statusCode: 400,
      error: { code: 'VALIDATION_ERROR' },
      meta: { path: '/v1/users' },
    });
    const details = body.error.details as unknown[];
    expect(Array.isArray(details)).toBe(true);
    expect(details.length).toBeGreaterThan(0);
    expect(typeof details[0]).toBe('string');
    expect(res.headers['x-request-id']).toBe(body.meta.requestId);
  });
});
