import { INestApplication, VersioningType } from '@nestjs/common';

export const DEFAULT_API_VERSION = '1';

export function applyVersioning(app: INestApplication): void {
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: DEFAULT_API_VERSION,
  });
}
