import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import type { Request } from 'express';
import { ClsService } from 'nestjs-cls';
import { CLS_KEYS } from '../context/cls.keys';
import { REQUEST_ID_HEADER } from '../context/request-id';
import type { ErrorBody, ErrorEnvelope } from '../types/response.types';

interface NestHttpExceptionBody {
  statusCode?: number;
  message?: string | string[];
  error?: string;
  code?: string;
  details?: unknown;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(
    private readonly adapterHost: HttpAdapterHost,
    private readonly cls: ClsService,
  ) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const { httpAdapter } = this.adapterHost;
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request>();
    const res = ctx.getResponse<unknown>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const error = this.toErrorBody(exception, status);
    const requestId = this.cls.get<string>(CLS_KEYS.REQUEST_ID) ?? 'unknown';
    const path =
      (httpAdapter.getRequestUrl(req) as string | undefined) ?? req.url ?? '';

    const envelope: ErrorEnvelope = {
      statusCode: status,
      error,
      meta: { requestId, timestamp: new Date().toISOString(), path },
    };

    httpAdapter.setHeader(res, REQUEST_ID_HEADER, requestId);

    if (status >= 500 || !(exception instanceof HttpException)) {
      this.logger.error(
        `Unhandled ${status} on ${req.method} ${path}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    } else {
      this.logger.warn(
        `Handled ${status} on ${req.method} ${path}: ${error.code} - ${error.message}`,
      );
    }

    httpAdapter.reply(res, envelope, status);
  }

  private toErrorBody(exception: unknown, status: number): ErrorBody {
    if (exception instanceof HttpException) {
      const raw = exception.getResponse();
      // HttpStatus is a reverse-mapped numeric enum: HttpStatus[400] === 'BAD_REQUEST'.
      const statusName = HttpStatus[status];
      const defaultCode =
        typeof statusName === 'string' ? statusName : `HTTP_${status}`;

      if (typeof raw === 'string') {
        return { code: defaultCode, message: raw };
      }

      const body = (raw ?? {}) as NestHttpExceptionBody;

      if (typeof body.code === 'string' && typeof body.message === 'string') {
        return {
          code: body.code,
          message: body.message,
          ...(body.details !== undefined ? { details: body.details } : {}),
        };
      }

      if (Array.isArray(body.message)) {
        return {
          code: 'VALIDATION_ERROR',
          message: body.error ?? 'Validation failed',
          details: body.message,
        };
      }

      return {
        code: defaultCode,
        message:
          typeof body.message === 'string'
            ? body.message
            : (body.error ?? exception.message),
      };
    }

    return { code: 'INTERNAL_ERROR', message: 'Internal server error' };
  }
}
