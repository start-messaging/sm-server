import { HttpException, HttpStatus } from '@nestjs/common';

export interface AppExceptionPayload {
  code: string;
  message: string;
  details?: unknown;
}

export class AppException extends HttpException {
  constructor(payload: AppExceptionPayload, status: HttpStatus | number) {
    super(payload, status);
  }
}
