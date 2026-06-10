import { presentCategory, type CategoryProfile } from './category-profile';
import { Service, ServiceStatus } from './entities/service.entity';

/**
 * Customer-facing shape of a service — no `provider`, no admin counters.
 * Returned by `GET /v1/services` (the "available in your country" list).
 */
export interface PublicServiceProfile {
  key: string;
  name: string;
  short: string;
  description: string | null;
  status: ServiceStatus;
  categories: CategoryProfile[];
}

export function presentPublicService(s: Service): PublicServiceProfile {
  const categories = [...(s.categories ?? [])]
    .sort((a, b) => a.sortOrder - b.sortOrder || a.key.localeCompare(b.key))
    .map(presentCategory);
  return {
    key: s.key,
    name: s.name,
    short: s.short,
    description: s.description,
    status: s.status,
    categories,
  };
}
