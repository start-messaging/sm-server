import { randomBytes } from 'node:crypto';

/**
 * URL-safe slug from a display name: lowercase, diacritics stripped,
 * non-alphanumerics collapsed to single hyphens. Never empty — falls back so
 * an all-symbol name still produces a usable slug.
 */
export function slugify(name: string, fallback = 'workspace'): string {
  const slug = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip combining diacritics
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
  return slug || fallback;
}

/**
 * Short random suffix for resolving slug collisions ('acme' → 'acme-7f3a').
 * Hex keeps the suffix inside slugify's own [a-z0-9-] charset.
 */
export function slugSuffix(): string {
  return randomBytes(2).toString('hex');
}
