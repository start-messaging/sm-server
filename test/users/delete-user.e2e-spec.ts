import request from 'supertest';
import { createTestApp, TestAppContext } from '../helpers/create-test-app';

describe('DELETE /users/:id', () => {
  let ctx: TestAppContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('removes a user', () => {
    return request(ctx.app.getHttpServer())
      .delete('/users/42')
      .expect(200)
      .expect('This action removes a #42 user');
  });
});
