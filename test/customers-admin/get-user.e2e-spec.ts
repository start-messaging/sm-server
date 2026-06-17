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
  seedLadder,
} from '../helpers/workspaces';

const UNKNOWN_UUID = '00000000-0000-4000-8000-000000000000';

interface UserDetail {
  user: {
    id: string;
    email: string;
    fullName: string;
    countryCode: string | null;
    status: string;
    emailVerified: boolean;
    mobileVerified: boolean;
    mobileE164: string | null;
  };
  workspaces: {
    id: string;
    slug: string;
    serviceKey: string;
    serviceName: string;
    planCode: string;
    role: string;
    countryCode: string;
    defaultCurrency: string;
    overrideCount: number;
  }[];
}

describe('GET /v1/admin/users/:id', () => {
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
      .get(`/v1/admin/users/${id}`)
      .set('Authorization', `Bearer ${token}`);

  /** Resolve a user's id through the admin list (search by exact email). */
  const idByEmail = async (email: string): Promise<string> => {
    const res = await request(ctx.app.getHttpServer())
      .get(`/v1/admin/users?search=${encodeURIComponent(email)}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const id = asSuccess<{ items: { id: string }[] }>(res.body).data.items[0]
      ?.id;
    if (!id) throw new Error(`no admin-users row for ${email}`);
    return id;
  };

  it('returns the profile and the workspaces with override counts', async () => {
    const serviceKey = await seedAvailableServiceIN(ctx.app);
    const user = await registerOnboardedUser(ctx.app, ctx.app.getHttpServer());
    const userId = await idByEmail(user.email);

    // Profile before any workspace exists.
    const bare = asSuccess<UserDetail>(
      (await get(userId).expect(200)).body,
    ).data;
    expect(bare.user).toMatchObject({
      email: user.email,
      fullName: 'Test User',
      countryCode: 'IN',
      status: 'active',
      emailVerified: true,
      mobileVerified: true,
      mobileE164: user.mobileE164,
    });
    expect(bare.workspaces).toHaveLength(0);

    // With a workspace: card facts + overrideCount counts CELLS, not rungs.
    const ws = await createWorkspace(
      ctx.app.getHttpServer(),
      user.accessToken,
      serviceKey,
    );
    const withWs = asSuccess<UserDetail>(
      (await get(userId).expect(200)).body,
    ).data;
    expect(withWs.workspaces).toHaveLength(1);
    expect(withWs.workspaces[0]).toMatchObject({
      id: ws.id,
      slug: ws.slug,
      serviceKey,
      planCode: 'FREE',
      role: 'OWNER',
      countryCode: 'IN',
      defaultCurrency: 'INR',
      overrideCount: 0,
    });

    await seedLadder(ctx.app, {
      workspaceId: ws.id,
      serviceKey,
      countryCode: 'IN',
      categoryKey: 'default',
      currency: 'INR',
      rungs: [
        { minQty: 0, sellMicros: 90000 },
        { minQty: 10000, sellMicros: 80000 },
      ],
    });
    const withLadder = asSuccess<UserDetail>(
      (await get(userId).expect(200)).body,
    ).data;
    // One overridden cell — a 2-rung ladder is still ONE custom rate.
    expect(withLadder.workspaces[0]?.overrideCount).toBe(1);
  });

  it('returns 404 USER_NOT_FOUND for an unknown id', async () => {
    const res = await get(UNKNOWN_UUID).expect(404);
    expect(asError(res.body).error.code).toBe('USER_NOT_FOUND');
  });

  it('rejects a malformed id with 400', async () => {
    await get('not-a-uuid').expect(400);
  });

  it('rejects unauthenticated requests with 401', async () => {
    await request(ctx.app.getHttpServer())
      .get(`/v1/admin/users/${UNKNOWN_UUID}`)
      .expect(401);
  });
});
