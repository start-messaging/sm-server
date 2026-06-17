import {
  registerDecorator,
  type ValidationArguments,
  type ValidationOptions,
} from 'class-validator';

/**
 * Set-level invariants for a ladder PUT (element-level rules — int, ≥0 — are
 * the rung DTO's job). Two rules only:
 *  - `minQty` must be unique within the set (ranges are structural: a rung's
 *    "to" IS the next rung's `minQty`, so duplicates are the only way to
 *    overlap);
 *  - the lowest rung must start at `minQty 0`, so an overridden cell always
 *    matches some rung — a ladder that starts above 0 would silently price low
 *    volumes off the country base row, re-creating the "is this cell
 *    overridden?" ambiguity the unified-ladder model exists to remove.
 */
function rungsError(value: unknown): string | null {
  if (!Array.isArray(value)) return 'rungs must be an array';
  const seen = new Set<number>();
  let lowest = Number.POSITIVE_INFINITY;
  for (const rung of value) {
    const minQty = (rung as { minQty?: unknown } | null)?.minQty;
    // Non-integer/negative values are reported by the rung DTO validators.
    if (typeof minQty !== 'number' || !Number.isInteger(minQty) || minQty < 0)
      continue;
    if (seen.has(minQty)) {
      return `rungs must have unique minQty values (duplicate ${minQty})`;
    }
    seen.add(minQty);
    if (minQty < lowest) lowest = minQty;
  }
  if (seen.size > 0 && lowest !== 0) {
    return 'the first rung must start at minQty 0 — the ladder must cover low volume too';
  }
  return null;
}

export const IsLadderRungs =
  (options?: ValidationOptions): PropertyDecorator =>
  (object: object, propertyName: string | symbol) => {
    registerDecorator({
      name: 'isLadderRungs',
      target: object.constructor,
      propertyName: propertyName as string,
      options,
      validator: {
        validate: (value: unknown) => rungsError(value) === null,
        defaultMessage: (args?: ValidationArguments) =>
          rungsError(args?.value) ?? 'rungs are invalid',
      },
    });
  };
