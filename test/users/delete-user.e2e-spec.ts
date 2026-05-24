import request from 'supertest';
import { createTestApp, TestAppContext } from '../helpers/create-test-app';
import { asError, asSuccess } from '../helpers/envelope';

describe('DELETE /v1/users/:id', () => {
  let ctx: TestAppContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('removes a user and returns the success envelope', async () => {
    const res = await request(ctx.app.getHttpServer())
      .delete('/v1/users/42')
      .expect(200);
    const body = asSuccess<{ id: number; deleted: boolean }>(res.body);

    expect(body.data).toEqual({ id: 42, deleted: true });
    expect(res.headers['x-request-id']).toBe(body.meta.requestId);
  });

  it('returns a 404 envelope when the user does not exist', async () => {
    const res = await request(ctx.app.getHttpServer())
      .delete('/v1/users/9999')
      .expect(404);
    const body = asError(res.body);

    expect(body).toMatchObject({
      statusCode: 404,
      error: { code: 'USER_NOT_FOUND', message: 'User 9999 not found' },
      meta: { path: '/v1/users/9999' },
    });
  });
});
