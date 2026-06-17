import request from 'supertest';
import { PlatformRole } from '../../src/admin/enums/platform-role.enum';
import { createStaff, loginStaff } from '../helpers/admin';
import {
  DEFAULT_PASSWORD,
  registerOnboardedUser,
  registerVerifiedUser,
  uniqueEmail,
} from '../helpers/auth';
import { createTestApp, TestAppContext } from '../helpers/create-test-app';
import { asSuccess } from '../helpers/envelope';
import {
  createWorkspace,
  ensureFreePlan,
  seedAvailableServiceIN,
} from '../helpers/workspaces';

interface UserRow {
  id: string;
  email: string;
  fullName: string;
  status: string;
  workspacesCount: number;
  roles: string[];
}
interface UsersPage {
  items: UserRow[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
}

describe('GET /v1/admin/users', () => {
  let ctx: TestAppContext;
  let token: string;

  beforeAll(async () => {
    ctx = await createTestApp();
    await ensureFreePlan(ctx.app);
    // Reads are open to ANY staff — use the lowest role deliberately.
    const support = await createStaff(ctx.app, PlatformRole.SUPPORT);
    token = await loginStaff(ctx.app.getHttpServer(), support.email);
  });

  afterAll(async () => {
    await ctx.close();
  });

  const list = (query = '') =>
    request(ctx.app.getHttpServer())
      .get(`/v1/admin/users${query}`)
      .set('Authorization', `Bearer ${token}`);

  it('lists users with pagination meta, readable by any staff', async () => {
    await registerVerifiedUser(ctx.app.getHttpServer());
    const res = await list().expect(200);
    const page = asSuccess<UsersPage>(res.body).data;
    expect(Array.isArray(page.items)).toBe(true);
    expect(page.items.length).toBeGreaterThan(0);
    expect(page.meta).toMatchObject({ page: 1, pageSize: 20 });
    expect(page.meta.total).toBeGreaterThan(0);
  });

  it('searches by email and by name fragment', async () => {
    const user = await registerVerifiedUser(ctx.app.getHttpServer());

    const byEmail = await list(
      `?search=${encodeURIComponent(user.email)}`,
    ).expect(200);
    const emailPage = asSuccess<UsersPage>(byEmail.body).data;
    expect(emailPage.items).toHaveLength(1);
    expect(emailPage.items[0]?.email).toBe(user.email);
    expect(emailPage.items[0]?.workspacesCount).toBe(0);

    // A user with a distinctive full name, created via raw signup.
    const zebraEmail = uniqueEmail('zebra');
    const zebraName = `Zebra ${zebraEmail}`;
    await request(ctx.app.getHttpServer())
      .post('/v1/auth/signup')
      .send({
        email: zebraEmail,
        password: DEFAULT_PASSWORD,
        fullName: zebraName,
      })
      .expect(201);
    const byName = await list(
      `?search=${encodeURIComponent(zebraName)}`,
    ).expect(200);
    const namePage = asSuccess<UsersPage>(byName.body).data;
    expect(namePage.items).toHaveLength(1);
    expect(namePage.items[0]?.fullName).toBe(zebraName);
  });

  it('filters by status', async () => {
    // Signup without verify → pending_verification.
    const email = uniqueEmail('pending');
    await request(ctx.app.getHttpServer())
      .post('/v1/auth/signup')
      .send({ email, password: DEFAULT_PASSWORD, fullName: 'Pending Person' })
      .expect(201);

    const pending = await list(
      `?search=${encodeURIComponent(email)}&status=pending_verification`,
    ).expect(200);
    expect(asSuccess<UsersPage>(pending.body).data.items).toHaveLength(1);

    const active = await list(
      `?search=${encodeURIComponent(email)}&status=active`,
    ).expect(200);
    expect(asSuccess<UsersPage>(active.body).data.items).toHaveLength(0);
  });

  it('counts a user’s workspaces', async () => {
    const serviceKey = await seedAvailableServiceIN(ctx.app);
    const user = await registerOnboardedUser(ctx.app, ctx.app.getHttpServer());
    await createWorkspace(
      ctx.app.getHttpServer(),
      user.accessToken,
      serviceKey,
    );

    const res = await list(`?search=${encodeURIComponent(user.email)}`).expect(
      200,
    );
    const page = asSuccess<UsersPage>(res.body).data;
    expect(page.items).toHaveLength(1);
    expect(page.items[0]?.workspacesCount).toBe(1);
  });

  it('exposes roles and filters by role', async () => {
    const serviceKey = await seedAvailableServiceIN(ctx.app);
    const owner = await registerOnboardedUser(ctx.app, ctx.app.getHttpServer());
    await createWorkspace(
      ctx.app.getHttpServer(),
      owner.accessToken,
      serviceKey,
    );
    const noWs = await registerVerifiedUser(ctx.app.getHttpServer());

    const ownerRow = asSuccess<UsersPage>(
      (await list(`?search=${encodeURIComponent(owner.email)}`).expect(200))
        .body,
    ).data.items[0];
    expect(ownerRow?.roles).toEqual(['OWNER']);

    const noWsRow = asSuccess<UsersPage>(
      (await list(`?search=${encodeURIComponent(noWs.email)}`).expect(200))
        .body,
    ).data.items[0];
    expect(noWsRow?.roles).toEqual([]);

    // ?role=OWNER keeps the owner, drops the no-workspace user.
    const byOwner = asSuccess<UsersPage>(
      (
        await list(
          `?search=${encodeURIComponent(owner.email)}&role=OWNER`,
        ).expect(200)
      ).body,
    ).data;
    expect(byOwner.items).toHaveLength(1);

    // ?role=AGENT matches nobody yet (no invites).
    const byAgent = asSuccess<UsersPage>(
      (
        await list(
          `?search=${encodeURIComponent(owner.email)}&role=AGENT`,
        ).expect(200)
      ).body,
    ).data;
    expect(byAgent.items).toHaveLength(0);

    // ?role=none is the no-workspace bucket.
    const ownerNone = asSuccess<UsersPage>(
      (
        await list(
          `?search=${encodeURIComponent(owner.email)}&role=none`,
        ).expect(200)
      ).body,
    ).data;
    expect(ownerNone.items).toHaveLength(0);
    const noWsNone = asSuccess<UsersPage>(
      (
        await list(
          `?search=${encodeURIComponent(noWs.email)}&role=none`,
        ).expect(200)
      ).body,
    ).data;
    expect(noWsNone.items).toHaveLength(1);

    // An unknown role value is rejected.
    await list('?role=BOGUS').expect(400);
  });

  it('rejects unauthenticated requests with 401', async () => {
    await request(ctx.app.getHttpServer()).get('/v1/admin/users').expect(401);
  });
});
