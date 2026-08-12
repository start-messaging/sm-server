import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  StreamableFile,
} from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { Observable, map } from 'rxjs';
import { CLS_KEYS } from '../context/cls.keys';
import { SuccessEnvelope, isSuccessEnvelope } from '../types/response.types';

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<
  T,
  SuccessEnvelope<T> | T
> {
  constructor(private readonly cls: ClsService) {}

  intercept(
    context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<SuccessEnvelope<T> | T> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    // Meta hub.challenge must be the raw challenge string (text/plain), not
    // our JSON success envelope — otherwise Verify and save fails.
    // SSE streams must stay MessageEvent payloads (text/event-stream).
    const req = context.switchToHttp().getRequest<{
      method?: string;
      path?: string;
      url?: string;
      headers?: { accept?: string };
    }>();
    const path = req.path ?? req.url ?? '';
    const accept = req.headers?.accept ?? '';
    if (
      (req.method === 'GET' &&
        (path === '/v1/webhooks/meta' ||
          path.startsWith('/v1/webhooks/meta?'))) ||
      accept.includes('text/event-stream') ||
      path.includes('/whatsapp/events')
    ) {
      return next.handle();
    }

    return next.handle().pipe(
      map((value: T): SuccessEnvelope<T> | T => {
        if (
          value instanceof StreamableFile ||
          Buffer.isBuffer(value) ||
          isSuccessEnvelope(value)
        ) {
          return value;
        }
        return {
          data: value,
          meta: {
            requestId: this.cls.get<string>(CLS_KEYS.REQUEST_ID) ?? 'unknown',
            timestamp: new Date().toISOString(),
          },
        };
      }),
    );
  }
}
