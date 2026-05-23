import { INestApplication } from '@nestjs/common';
import { applyValidation } from './validation.config';
import { applyVersioning } from './versioning.config';

export function applyGlobalConfig(app: INestApplication): void {
  applyValidation(app);
  applyVersioning(app);
}
