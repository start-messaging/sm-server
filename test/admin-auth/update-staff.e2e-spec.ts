import request from 'supertest';
import { PlatformRole } from '../../src/admin/enums/platform-role.enum';
import { createStaff, loginStaff, loginStaffTokens } from '../helpers/admin';
import { DEFAULT_PASSWORD } from '../helpers/auth';
import { createTestApp, TestAppContext } from '../helpers/create-test-app';
import { asError, asSuccess } from '../helpers/envelope';

describe('PATCH /v1/admin/staff/:id (update)', () => {
  let ctx: TestAppContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.close();
  });

  const superAdminToken = async (): Promise<string> => {
    const admin = await createStaff(ctx.app, PlatformRole.SUPER_ADMIN);
    return loginStaff(ctx.app.getHttpServer(), admin.email);
  };

  it('changes a member role and revokes their existing session', async () => {
    const server = ctx.app.getHttpServer();
    const adminToken = await superAdminToken();
    const target = await createStaff(ctx.app, PlatformRole.SUPPORT);
    const targetTokens = await loginStaffTokens(server, target.email);

    const res = await request(server)
      .patch(`/v1/admin/staff/${target.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ platformRole: PlatformRole.FINANCE })
      .expect(200);
    expect(
      asSuccess<{ platformRole: string }>(res.body).data.platformRole,
    ).toBe(PlatformRole.FINANCE);

    // The old access token (minted with the old role) is revoked.
    await request(server)
      .get('/v1/admin/auth/me')
      .set('Authorization', `Bearer ${targetTokens.accessToken}`)
      .expect(401);
  });

  it('suspends a member so they can no longer log in, then reactivates', async () => {
    const server = ctx.app.getHttpServer();
    const adminToken = await superAdminToken();
    const target = await createStaff(ctx.app, PlatformRole.SUPPORT);

    await request(server)
      .patch(`/v1/admin/staff/${target.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'suspended' })
      .expect(200);

    // Suspended → login blocked.
    await request(server)
      .post('/v1/admin/auth/login')
      .send({ email: target.email, password: DEFAULT_PASSWORD })
      .expect(403);

    // Reactivate → login works again.
    await request(server)
      .patch(`/v1/admin/staff/${target.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'active' })
      .expect(200);
    await request(server)
      .post('/v1/admin/auth/login')
      .send({ email: target.email, password: DEFAULT_PASSWORD })
      .expect(200);
  });

  it('prevents editing your own account with 400 STAFF_SELF_ACTION', async () => {
    const server = ctx.app.getHttpServer();
    const admin = await createStaff(ctx.app, PlatformRole.SUPER_ADMIN);
    const token = await loginStaff(server, admin.email);

    const res = await request(server)
      .patch(`/v1/admin/staff/${admin.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ platformRole: PlatformRole.SUPPORT })
      .expect(400);
    expect(asError(res.body).error.code).toBe('STAFF_SELF_ACTION');
  });

  it('forbids a non-SUPER_ADMIN from updating staff with 403', async () => {
    const server = ctx.app.getHttpServer();
    const support = await createStaff(ctx.app, PlatformRole.SUPPORT);
    const supportToken = await loginStaff(server, support.email);
    const victim = await createStaff(ctx.app, PlatformRole.READ_ONLY);

    await request(server)
      .patch(`/v1/admin/staff/${victim.id}`)
      .set('Authorization', `Bearer ${supportToken}`)
      .send({ status: 'suspended' })
      .expect(403);
  });

  it('returns 404 STAFF_NOT_FOUND for an unknown id', async () => {
    const adminToken = await superAdminToken();
    const res = await request(ctx.app.getHttpServer())
      .patch('/v1/admin/staff/00000000-0000-4000-8000-000000000000')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'suspended' })
      .expect(404);
    expect(asError(res.body).error.code).toBe('STAFF_NOT_FOUND');
  });
});
