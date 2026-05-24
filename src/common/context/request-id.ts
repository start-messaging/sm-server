import { randomUUID } from 'node:crypto';
import type { Request } from 'express';

export const REQUEST_ID_HEADER = 'x-request-id';

export function resolveRequestId(req: Request): string {
  const inbound = req.headers[REQUEST_ID_HEADER];
  if (
    typeof inbound === 'string' &&
    inbound.length > 0 &&
    inbound.length <= 200
  ) {
    return inbound;
  }
  if (Array.isArray(inbound) && typeof inbound[0] === 'string') {
    return inbound[0];
  }
  return randomUUID();
}
