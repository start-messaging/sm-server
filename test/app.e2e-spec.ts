import request from 'supertest';
import { asSuccess } from './helpers/envelope';
import { createTestApp, TestAppContext } from './helpers/create-test-app';

describe('GET /', () => {
  let ctx: TestAppContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('returns the hello message wrapped in the success envelope', async () => {
    const res = await request(ctx.app.getHttpServer()).get('/').expect(200);
    const body = asSuccess<string>(res.body);

    expect(body.data).toBe('Hello World!');
    expect(body.meta.requestId).toEqual(expect.any(String));
    expect(body.meta.requestId.length).toBeGreaterThan(0);
    expect(body.meta.timestamp).toEqual(expect.any(String));
    expect(res.headers['x-request-id']).toBe(body.meta.requestId);
  });
});
