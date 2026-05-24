import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { applyGlobalConfig } from '../../src/config/apply-global-config';

export interface TestAppContext {
  app: INestApplication<App>;
  close: () => Promise<void>;
}

export async function createTestApp(): Promise<TestAppContext> {
  const moduleFixture = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app: INestApplication<App> = moduleFixture.createNestApplication({
    bufferLogs: true,
  });

  applyGlobalConfig(app);
  await app.init();

  return {
    app,
    close: () => app.close(),
  };
}
