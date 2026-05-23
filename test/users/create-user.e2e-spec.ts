import request from 'supertest';
import { createTestApp, TestAppContext } from '../helpers/create-test-app';

describe('POST /users', () => {
  let ctx: TestAppContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('creates a user', () => {
    return request(ctx.app.getHttpServer())
      .post('/users')
      .send({})
      .expect(201)
      .expect('This action adds a new user');
  });
});
