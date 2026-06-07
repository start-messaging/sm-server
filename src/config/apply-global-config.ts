import { INestApplication } from '@nestjs/common';
import { applyCors } from './cors.config';
import { applyLogger } from './logger.config';
import { applyValidation } from './validation.config';
import { applyVersioning } from './versioning.config';

export function applyGlobalConfig(app: INestApplication): void {
  applyLogger(app);
  applyCors(app);
  applyValidation(app);
  applyVersioning(app);
}
