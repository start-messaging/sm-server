import type {
  ErrorEnvelope,
  SuccessEnvelope,
} from '../../src/common/types/response.types';

export function asSuccess<T>(body: unknown): SuccessEnvelope<T> {
  return body as SuccessEnvelope<T>;
}

export function asError(body: unknown): ErrorEnvelope {
  return body as ErrorEnvelope;
}
