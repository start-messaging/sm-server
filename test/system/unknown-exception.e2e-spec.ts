import { Controller, Get, INestApplication, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { LoggerModule } from '../../src/common/logger/logger.module';
import { applyGlobalConfig } from '../../src/config/apply-global-config';
import { ClsConfigModule } from '../../src/config/cls.config';
import { HttpModule } from '../../src/config/http.config';
import { asError } from '../helpers/envelope';

@Controller({ path: '__test/boom', version: '1' })
class BoomController {
  @Get()
  boom(): never {
    throw new Error('synthetic non-http error');
  }
}

@Module({
  imports: [ClsConfigModule, LoggerModule, HttpModule],
  controllers: [BoomController],
})
class BoomTestModule {}

describe('Unknown exception envelope', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [BoomTestModule],
    }).compile();

    app = moduleFixture.createNestApplication({ bufferLogs: true });
    applyGlobalConfig(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns a 500 envelope, masks internals, and matches X-Request-Id', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/__test/boom')
      .expect(500);
    const body = asError(res.body);

    expect(body).toMatchObject({
      statusCode: 500,
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
      meta: { path: '/v1/__test/boom' },
    });
    expect(body.error.message).not.toMatch(/synthetic/);
    expect(res.headers['x-request-id']).toBe(body.meta.requestId);
  });
});
