import { ServiceCategory } from './entities/service-category.entity';

/** Public shape of a service category. */
export interface CategoryProfile {
  key: string;
  label: string;
  hint: string | null;
}

export function presentCategory(c: ServiceCategory): CategoryProfile {
  return { key: c.key, label: c.label, hint: c.hint };
}
