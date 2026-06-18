import type { INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import request from 'supertest';
import type { App } from 'supertest/types';
import { IsNull, Repository } from 'typeorm';
import { Plan, PlanStatus } from '../../src/plans/entities/plan.entity';
import { WorkspaceServiceRate } from '../../src/workspaces/entities/workspace-service-rate.entity';
import { ensureCountryIN, registerOnboardedUser } from './auth';
import { asSuccess } from './envelope';
import { seedRate, seedService } from './reference';

/**
 * Ensure the GLOBAL FREE plan row exists (idempotent) — workspace creation
 * depends on it the way auth flows depend on the IN country row.
 */
export async function ensureFreePlan(app: INestApplication): Promise<void> {
  const repo = app.get<Repository<Plan>>(getRepositoryToken(Plan));
  const existing = await repo.findOne({
    where: { code: 'FREE', serviceKey: IsNull() },
  });
  if (existing) return;
  await repo.save(
    repo.create({
      code: 'FREE',
      serviceKey: null,
      name: 'Free',
      tier: 0,
      trialDays: 0,
      status: PlanStatus.ACTIVE,
      features: {
        wa_campaigns: true,
        campaign_analytics: false,
        agent_inbox: true,
        api_access: false,
        support_level: 'email_bh',
      },
      limits: {
        max_workspaces_per_service: 1,
        max_agents: 1,
        max_members: 5,
        history_retention_days: 30,
        max_contacts: 1000,
      },
    }),
  );
}

/** Seed a (service-scoped) plan row, idempotent on (serviceKey, code). */
export async function seedPlan(
  app: INestApplication,
  overrides: Partial<Plan> & { serviceKey: string },
): Promise<Plan> {
  const repo = app.get<Repository<Plan>>(getRepositoryToken(Plan));
  const code = overrides.code ?? 'FREE';
  await repo.delete({ serviceKey: overrides.serviceKey, code });
  return repo.save(
    repo.create({
      code,
      name: `Test ${code}`,
      tier: 0,
      trialDays: 0,
      status: PlanStatus.ACTIVE,
      features: {},
      limits: {},
      ...overrides,
    }),
  );
}

/**
 * A service that is AVAILABLE in IN (active + active rate row) — the
 * precondition for creating a workspace as an IN-onboarded test user.
 * Also clears any service-scoped plan rows left under the (reused per-worker)
 * key by a sibling file's seedPlan, so plan resolution starts from the global
 * FREE again.
 */
export async function seedAvailableServiceIN(
  app: INestApplication,
): Promise<string> {
  await ensureCountryIN(app);
  const serviceKey = await seedService(app);
  await app
    .get<Repository<Plan>>(getRepositoryToken(Plan))
    .delete({ serviceKey });
  await seedRate(app, {
    serviceKey,
    countryCode: 'IN',
    categoryKey: 'default',
    currency: 'INR',
    sellMicros: 100000,
    providerCostMicros: 50000,
  });
  return serviceKey;
}

export interface CreatedWorkspace {
  id: string;
  name: string;
  slug: string;
  serviceKey: string;
  countryCode: string;
  defaultCurrency: string;
  planCode: string;
  role: string;
  status: string;
}

/**
 * Seed one (workspace, service, country, category) cell's LADDER directly via
 * the repo — delete-cell-then-insert, idempotent like `seedRate`. Bypasses the
 * API's category/currency checks deliberately (it's a fixture, not a test).
 */
export async function seedLadder(
  app: INestApplication,
  cell: {
    workspaceId: string;
    serviceKey: string;
    countryCode: string;
    categoryKey: string;
    currency: string;
    rungs: { minQty: number; sellMicros: number }[];
  },
): Promise<void> {
  const repo = app.get<Repository<WorkspaceServiceRate>>(
    getRepositoryToken(WorkspaceServiceRate),
  );
  await repo.delete({
    workspaceId: cell.workspaceId,
    serviceKey: cell.serviceKey,
    countryCode: cell.countryCode,
    categoryKey: cell.categoryKey,
  });
  await repo.save(
    cell.rungs.map((r) =>
      repo.create({
        workspaceId: cell.workspaceId,
        serviceKey: cell.serviceKey,
        countryCode: cell.countryCode,
        categoryKey: cell.categoryKey,
        minQty: r.minQty,
        sellMicros: r.sellMicros,
        currency: cell.currency,
        isActive: true,
      }),
    ),
  );
}

/** POST a workspace for an onboarded user's token and unwrap the summary. */
export async function createWorkspace(
  server: App,
  accessToken: string,
  serviceKey: string,
  name = 'Acme Traders',
): Promise<CreatedWorkspace> {
  const res = await request(server)
    .post(`/v1/services/${serviceKey}/workspaces`)
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ name })
    .expect(201);
  return asSuccess<CreatedWorkspace>(res.body).data;
}

/**
 * A brand-new onboarded user + their workspace (with a freshly-funded-zero
 * wallet) under `serviceKey`. Use in `beforeEach` for wallet/billing specs that
 * need a clean, isolated balance per test.
 */
export async function seedOnboardedWorkspace(
  app: INestApplication,
  server: App,
  serviceKey: string,
): Promise<{ workspace: CreatedWorkspace; accessToken: string }> {
  const user = await registerOnboardedUser(app, server);
  const workspace = await createWorkspace(server, user.accessToken, serviceKey);
  return { workspace, accessToken: user.accessToken };
}
