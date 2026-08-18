import type { TemplateCategory } from '../entities/wa-template.entity';

const CATEGORIES: readonly TemplateCategory[] = [
  'MARKETING',
  'UTILITY',
  'AUTHENTICATION',
];

/** Meta webhooks often use `en-US`; we persist Graph-style `en_US`. */
export function normalizeTemplateLanguage(language: string): string {
  return language.trim().replace(/-/g, '_');
}

export function parseTemplateCategory(raw: unknown): TemplateCategory | null {
  if (typeof raw !== 'string' || raw.trim() === '') return null;
  const upper = raw.trim().toUpperCase();
  return CATEGORIES.includes(upper as TemplateCategory)
    ? (upper as TemplateCategory)
    : null;
}
