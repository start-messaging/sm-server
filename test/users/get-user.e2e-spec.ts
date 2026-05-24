import request from 'supertest';
import { createTestApp, TestAppContext } from '../helpers/create-test-app';
import { asError, asSuccess } from '../helpers/envelope';

describe('GET /v1/users/:id', () => {
  let ctx: TestAppContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('returns a single user by id', async () => {
    const res = await request(ctx.app.getHttpServer())
      .get('/v1/users/42')
      .expect(200);
    const body = asSuccess<{ id: number }>(res.body);

    expect(body.data).toEqual({ id: 42 });
    expect(body.meta.requestId).toEqual(expect.any(String));
    expect(res.headers['x-request-id']).toBe(body.meta.requestId);
  });

  it('returns a 404 envelope when the user does not exist', async () => {
    const res = await request(ctx.app.getHttpServer())
      .get('/v1/users/9999')
      .expect(404);
    const body = asError(res.body);

    expect(body).toMatchObject({
      statusCode: 404,
      error: {
        code: 'USER_NOT_FOUND',
        message: 'User 9999 not found',
      },
      meta: { path: '/v1/users/9999' },
    });
    expect(res.headers['x-request-id']).toBe(body.meta.requestId);
  });

  it('returns a 400 envelope when the id is not an integer', async () => {
    const res = await request(ctx.app.getHttpServer())
      .get('/v1/users/not-a-number')
      .expect(400);
    const body = asError(res.body);

    expect(body.statusCode).toBe(400);
    expect(body.error.code).toBe('BAD_REQUEST');
    expect(body.meta.path).toBe('/v1/users/not-a-number');
  });

  it('echoes an inbound X-Request-Id header', async () => {
    const inbound = '11111111-1111-4111-8111-111111111111';
    const res = await request(ctx.app.getHttpServer())
      .get('/v1/users/42')
      .set('X-Request-Id', inbound)
      .expect(200);
    const body = asSuccess<{ id: number }>(res.body);

    expect(res.headers['x-request-id']).toBe(inbound);
    expect(body.meta.requestId).toBe(inbound);
  });
});
