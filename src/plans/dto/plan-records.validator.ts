import {
  registerDecorator,
  type ValidationArguments,
  type ValidationOptions,
} from 'class-validator';

/**
 * Entitlement records are OPEN (any number of keys, added as data) but not
 * shapeless: keys are snake_case so client/server lookups never fight over
 * casing, feature values are boolean|string, limit values are non-negative
 * integers or null (= unlimited). These validators are the single place that
 * contract is enforced at the API edge.
 */
export const PLAN_RECORD_KEY_PATTERN = /^[a-z][a-z0-9_]{0,49}$/;
const MAX_KEYS = 50;
const MAX_FEATURE_STRING = 120;

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Returns a human-readable problem, or null when the record is valid. */
function recordError(
  value: unknown,
  kind: 'features' | 'limits',
): string | null {
  if (!isPlainRecord(value)) return `${kind} must be a key-value object`;
  const keys = Object.keys(value);
  if (keys.length > MAX_KEYS) return `${kind} allows at most ${MAX_KEYS} keys`;
  for (const key of keys) {
    if (!PLAN_RECORD_KEY_PATTERN.test(key)) {
      return `${kind} key "${key}" must be snake_case (a-z, 0-9, _; max 50 chars)`;
    }
    const v = value[key];
    if (kind === 'features') {
      if (typeof v === 'boolean') continue;
      if (typeof v === 'string' && v.length <= MAX_FEATURE_STRING) continue;
      return `features.${key} must be a boolean or a string (max ${MAX_FEATURE_STRING} chars)`;
    }
    if (v === null) continue;
    if (typeof v === 'number' && Number.isInteger(v) && v >= 0) continue;
    return `limits.${key} must be a non-negative integer or null (= unlimited)`;
  }
  return null;
}

function makeRecordDecorator(kind: 'features' | 'limits', name: string) {
  return (options?: ValidationOptions): PropertyDecorator =>
    (object: object, propertyName: string | symbol) => {
      registerDecorator({
        name,
        target: object.constructor,
        propertyName: propertyName as string,
        options,
        validator: {
          validate: (value: unknown) => recordError(value, kind) === null,
          defaultMessage: (args?: ValidationArguments) =>
            recordError(args?.value, kind) ?? `${kind} is invalid`,
        },
      });
    };
}

export const IsPlanFeatures = makeRecordDecorator('features', 'isPlanFeatures');
export const IsPlanLimits = makeRecordDecorator('limits', 'isPlanLimits');
