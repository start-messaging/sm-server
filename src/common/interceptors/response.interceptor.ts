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
