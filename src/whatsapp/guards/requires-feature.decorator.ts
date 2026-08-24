import { SetMetadata } from '@nestjs/common';

export const REQUIRES_FEATURE_KEY = 'plan:requiresFeature';

/**
 * Plan feature key required by a route guarded by RequiresFeatureGuard.
 * Pass a PLAN_FEATURE_KEYS constant — never a bare literal.
 */
export const RequiresFeature = (feature: string) =>
  SetMetadata(REQUIRES_FEATURE_KEY, feature);
