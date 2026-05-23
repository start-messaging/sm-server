import request from 'supertest';
import { createTestApp, TestAppContext } from '../helpers/create-test-app';

describe('GET /users/:id', () => {
  let ctx: TestAppContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('returns a single user by id', () => {
    return request(ctx.app.getHttpServer())
      .get('/users/42')
      .expect(200)
      .expect('This action returns a #42 user');
  });
});
