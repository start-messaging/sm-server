import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';

export interface TestAppContext {
  app: INestApplication<App>;
  close: () => Promise<void>;
}

export async function createTestApp(): Promise<TestAppContext> {
  const moduleFixture = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app: INestApplication<App> = moduleFixture.createNestApplication();
  // Global pipes / filters / interceptors will be applied here via a shared
  // applyGlobalConfig(app) helper once error handling lands.
  await app.init();

  return {
    app,
    close: () => app.close(),
  };
}
