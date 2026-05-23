import request from 'supertest';
import { createTestApp, TestAppContext } from '../helpers/create-test-app';

describe('GET /users', () => {
  let ctx: TestAppContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('lists all users', () => {
    return request(ctx.app.getHttpServer())
      .get('/users')
      .expect(200)
      .expect('This action returns all users');
  });
});
