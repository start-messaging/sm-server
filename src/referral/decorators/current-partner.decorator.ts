import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedPartner } from '../strategies/referral-jwt.strategy';

export const CurrentPartner = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedPartner => {
    const req = ctx.switchToHttp().getRequest<Request>();
    return req.user as AuthenticatedPartner;
  },
);
