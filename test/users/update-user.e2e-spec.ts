import request from 'supertest';
import { createTestApp, TestAppContext } from '../helpers/create-test-app';

describe('PATCH /users/:id', () => {
  let ctx: TestAppContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('updates a user', () => {
    return request(ctx.app.getHttpServer())
      .patch('/users/42')
      .send({})
      .expect(200)
      .expect('This action updates a #42 user');
  });
});
