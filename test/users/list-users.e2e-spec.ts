import request from 'supertest';
import { createTestApp, TestAppContext } from '../helpers/create-test-app';
import { asSuccess } from '../helpers/envelope';

describe('GET /v1/users', () => {
  let ctx: TestAppContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('lists all users wrapped in the success envelope', async () => {
    const res = await request(ctx.app.getHttpServer())
      .get('/v1/users')
      .expect(200);
    const body = asSuccess<Array<{ id: number }>>(res.body);

    expect(body.data).toEqual([{ id: 1 }, { id: 42 }]);
    expect(body.meta.requestId).toEqual(expect.any(String));
    expect(res.headers['x-request-id']).toBe(body.meta.requestId);
  });
});
