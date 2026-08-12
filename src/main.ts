// Telemetry must be the very first import so the OTEL SDK starts before any
// NestJS module is loaded — this mirrors the SMS server pattern.
import './telemetry';

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { applyGlobalConfig } from './config/apply-global-config';
import { setupSwagger } from './config/swagger.config';
import { shutdownTelemetry } from './telemetry';

async function bootstrap() {
  // rawBody: true enables req.rawBody for X-Hub-Signature-256 verification on
  // the Meta webhook endpoint — must come before body parsers are applied.
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
    rawBody: true,
  });
  applyGlobalConfig(app);
  setupSwagger(app);

  await app.listen(process.env.PORT ?? 3000);

  // Flush OTEL batches on graceful shutdown.
  const cleanup = () => {
    void (async () => {
      await app.close();
      await shutdownTelemetry();
      process.exit(0);
    })();
  };
  process.once('SIGTERM', cleanup);
  process.once('SIGINT', cleanup);
}
void bootstrap();
