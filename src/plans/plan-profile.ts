import { Plan } from './entities/plan.entity';
import type { PlanFeatures, PlanLimits } from './entities/plan.entity';

/** Admin-facing shape of a plan returned by the API. */
export interface PlanProfile {
  id: string;
  code: string;
  serviceKey: string | null;
  name: string;
  tier: number;
  trialDays: number;
  status: string;
  features: PlanFeatures;
  limits: PlanLimits;
}

export function presentPlan(plan: Plan): PlanProfile {
  return {
    id: plan.id,
    code: plan.code,
    serviceKey: plan.serviceKey,
    name: plan.name,
    tier: plan.tier,
    trialDays: plan.trialDays,
    status: plan.status,
    features: plan.features,
    limits: plan.limits,
  };
}
