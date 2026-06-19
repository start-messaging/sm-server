import request from 'supertest';
import { PlatformRole } from '../../src/admin/enums/platform-role.enum';
import { createStaff, loginStaff } from '../helpers/admin';
import { registerOnboardedUser } from '../helpers/auth';
import { createTestApp, TestAppContext } from '../helpers/create-test-app';
import { asError, asSuccess } from '../helpers/envelope';
import {
  createWorkspace,
  ensureFreePlan,
  seedAvailableServiceIN,
} from '../helpers/workspaces';

const UNKNOWN_UUID = '00000000-0000-4000-8000-000000000000';

interface WorkspaceDetail {
  id: string;
  name: string;
  slug: string;
  status: string;
  countryCode: string;
  defaultCurrency: string;
  plan: { code: string; name: string } | null;
  owner: { email: string } | null;
  membersCount: number;
  members: { userId: string; email: string; role: string; status: string }[];
  invitations: { email: string; role: string }[];
  services: { serviceKey: string; status: string }[];
  overrideCount: number;
}

describe('GET /v1/admin/workspaces/:id', () => {
  let ctx: TestAppContext;
  let token: string;

  beforeAll(async () => {
    ctx = await createTestApp();
    await ensureFreePlan(ctx.app);
    const support = await createStaff(ctx.app, PlatformRole.SUPPORT);
    token = await loginStaff(ctx.app.getHttpServer(), support.email);
  });

  afterAll(async () => {
    await ctx.close();
  });

  const get = (id: string) =>
    request(ctx.app.getHttpServer())
      .get(`/v1/admin/workspaces/${id}`)
      .set('Authorization', `Bearer ${token}`);

  it('returns the 360° header facts for a workspace', async () => {
    const serviceKey = await seedAvailableServiceIN(ctx.app);
    const user = await registerOnboardedUser(ctx.app, ctx.app.getHttpServer());
    const ws = await createWorkspace(
      ctx.app.getHttpServer(),
      user.accessToken,
      serviceKey,
    );

    const detail = asSuccess<WorkspaceDetail>(
      (await get(ws.id).expect(200)).body,
    ).data;
    expect(detail).toMatchObject({
      id: ws.id,
      name: ws.name,
      slug: ws.slug,
      status: 'active',
      countryCode: 'IN',
      defaultCurrency: 'INR',
      membersCount: 1,
      overrideCount: 0,
    });
    expect(detail.plan?.code).toBe('FREE');
    expect(detail.owner?.email).toBe(user.email);
    // The creator is the sole member, as OWNER, linking back to their account.
    expect(detail.members).toHaveLength(1);
    expect(detail.members[0]).toMatchObject({
      email: user.email,
      role: 'OWNER',
      status: 'active',
    });
    // No invites sent yet → empty (the field is always present).
    expect(detail.invitations).toEqual([]);
    expect(detail.services).toHaveLength(1);
    expect(detail.services[0]).toMatchObject({
      serviceKey,
      status: 'pending_setup',
    });
  });

  it('returns 404 WORKSPACE_NOT_FOUND for an unknown id', async () => {
    const res = await get(UNKNOWN_UUID).expect(404);
    expect(asError(res.body).error.code).toBe('WORKSPACE_NOT_FOUND');
  });

  it('rejects a malformed id with 400', async () => {
    await get('not-a-uuid').expect(400);
  });

  it('rejects unauthenticated requests with 401', async () => {
    await request(ctx.app.getHttpServer())
      .get(`/v1/admin/workspaces/${UNKNOWN_UUID}`)
      .expect(401);
  });
});
