import { INestApplication } from '@nestjs/common';
import { AppLogger } from '../common/logger/app-logger.service';

export function applyLogger(app: INestApplication): void {
  app.useLogger(app.get(AppLogger));
}
