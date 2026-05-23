import { ConsoleLogger, Injectable, LogLevel, Scope } from '@nestjs/common';
import { IS_PROD } from '../../config/env';

const LOG_LEVELS: LogLevel[] = IS_PROD
  ? ['fatal', 'error', 'warn', 'log']
  : ['fatal', 'error', 'warn', 'log', 'debug', 'verbose'];

// Transient scope: each consumer that injects AppLogger gets its own instance,
// so per-service setContext() calls don't overwrite each other.
@Injectable({ scope: Scope.TRANSIENT })
export class AppLogger extends ConsoleLogger {
  constructor() {
    super({
      prefix: 'sm-server',
      json: IS_PROD,
      colors: true,
      timestamp: true,
      logLevels: LOG_LEVELS,
    });
  }
}
