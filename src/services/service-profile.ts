import { presentCategory, type CategoryProfile } from './category-profile';
import { Service, ServiceStatus } from './entities/service.entity';

/** Public shape of a service, with its categories inlined. */
export interface ServiceProfile {
  key: string;
  name: string;
  short: string;
  provider: string | null;
  description: string | null;
  status: ServiceStatus;
  categories: CategoryProfile[];
  /** Distinct countries that have at least one rate row for this service. */
  pricedCountryCount: number;
}

export function presentService(
  s: Service,
  pricedCountryCount = 0,
): ServiceProfile {
  const categories = [...(s.categories ?? [])]
    .sort((a, b) => a.sortOrder - b.sortOrder || a.key.localeCompare(b.key))
    .map(presentCategory);
  return {
    key: s.key,
    name: s.name,
    short: s.short,
    provider: s.provider,
    description: s.description,
    status: s.status,
    categories,
    pricedCountryCount,
  };
}
