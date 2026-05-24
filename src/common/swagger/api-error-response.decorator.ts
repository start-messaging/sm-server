import { applyDecorators } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import { errorEnvelopeSchema } from './error-envelope.schema';

export interface ApiErrorResponseOptions {
  status: number;
  code: string;
  description?: string;
}

export function ApiErrorResponse(opts: ApiErrorResponseOptions) {
  return applyDecorators(
    ApiResponse({
      status: opts.status,
      description: opts.description ?? opts.code,
      schema: errorEnvelopeSchema(opts.status, opts.code),
    }),
  );
}
