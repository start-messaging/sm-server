import type { INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import request from 'supertest';
import type { App } from 'supertest/types';
import { Repository } from 'typeorm';
import { Plan } from '../../src/plans/entities/plan.entity';
import { asSuccess } from './envelope';

/** Mirror of the server's PlanProfile for assertions. */
export interface AdminPlan {
  id: string;
  code: string;
  serviceKey: string | null;
  name: string;
  tier: number;
  trialDays: number;
  status: string;
  features: Record<string, boolean | string>;
  limits: Record<string, number | null>;
}

/** Delete every plan row carrying `code` (any scope) so create specs start clean. */
export async function freshPlanCode(
  app: INestApplication,
  code: string,
): Promise<void> {
  await app.get<Repository<Plan>>(getRepositoryToken(Plan)).delete({ code });
}

/** POST /v1/admin/plans with a staff token and unwrap the profile. */
export async function createPlanViaApi(
  server: App,
  token: string,
  body: Record<string, unknown>,
): Promise<AdminPlan> {
  const res = await request(server)
    .post('/v1/admin/plans')
    .set('Authorization', `Bearer ${token}`)
    .send(body)
    .expect(201);
  return asSuccess<AdminPlan>(res.body).data;
}
