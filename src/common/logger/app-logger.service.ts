import { ConsoleLogger, Injectable, LogLevel } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { CLS_KEYS } from '../context/cls.keys';
import { IS_PROD } from '../../config/env';

const LOG_LEVELS: LogLevel[] = IS_PROD
  ? ['fatal', 'error', 'warn', 'log']
  : ['fatal', 'error', 'warn', 'log', 'debug', 'verbose'];

// Default (singleton) scope: required so Nest can resolve the logger via
// app.get() in applyLogger(). Per-request correlation comes from CLS, not
// per-instance setContext, so a single shared instance is correct.
@Injectable()
export class AppLogger extends ConsoleLogger {
  constructor(private readonly cls: ClsService) {
    super({
      prefix: 'sm-server',
      json: IS_PROD,
      colors: true,
      timestamp: true,
      logLevels: LOG_LEVELS,
    });
  }

  override log(message: unknown, ...rest: unknown[]): void {
    super.log(this.enrich(message), ...rest);
  }
  override error(message: unknown, ...rest: unknown[]): void {
    super.error(this.enrich(message), ...rest);
  }
  override warn(message: unknown, ...rest: unknown[]): void {
    super.warn(this.enrich(message), ...rest);
  }
  override debug(message: unknown, ...rest: unknown[]): void {
    super.debug(this.enrich(message), ...rest);
  }
  override verbose(message: unknown, ...rest: unknown[]): void {
    super.verbose(this.enrich(message), ...rest);
  }
  override fatal(message: unknown, ...rest: unknown[]): void {
    super.fatal(this.enrich(message), ...rest);
  }

  private enrich(message: unknown): unknown {
    const id = this.safeRequestId();
    if (!id) return message;
    if (typeof message === 'string') return `[req=${id}] ${message}`;
    if (message && typeof message === 'object') {
      return { requestId: id, ...(message as Record<string, unknown>) };
    }
    return message;
  }

  private safeRequestId(): string | undefined {
    try {
      return this.cls.get<string>(CLS_KEYS.REQUEST_ID);
    } catch {
      return undefined;
    }
  }
}
