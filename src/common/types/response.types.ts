export interface EnvelopeMeta {
  requestId: string;
  timestamp: string;
}

export interface SuccessEnvelope<T> {
  data: T;
  meta: EnvelopeMeta;
}

export interface ErrorBody {
  code: string;
  message: string;
  details?: unknown;
}

export interface ErrorEnvelope {
  statusCode: number;
  error: ErrorBody;
  meta: EnvelopeMeta & { path: string };
}

export function isSuccessEnvelope(
  value: unknown,
): value is SuccessEnvelope<unknown> {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  if (!('data' in v)) return false;
  const meta = v.meta as Record<string, unknown> | undefined;
  return !!meta && typeof meta.requestId === 'string';
}
