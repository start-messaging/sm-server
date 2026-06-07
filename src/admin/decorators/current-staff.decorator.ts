import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedStaff } from '../strategies/staff-jwt.strategy';

export const CurrentStaff = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedStaff => {
    const req = ctx.switchToHttp().getRequest<Request>();
    return req.user as AuthenticatedStaff;
  },
);
