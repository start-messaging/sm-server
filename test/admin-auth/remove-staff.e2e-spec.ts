import request from 'supertest';
import { PlatformRole } from '../../src/admin/enums/platform-role.enum';
import { createStaff, loginStaff, loginStaffTokens } from '../helpers/admin';
import { createTestApp, TestAppContext } from '../helpers/create-test-app';
import { asError, asSuccess } from '../helpers/envelope';

interface StaffRow {
  email: string;
}

describe('DELETE /v1/admin/staff/:id (remove)', () => {
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

  it('lets a SUPER_ADMIN remove a member and revokes their session', async () => {
    const server = ctx.app.getHttpServer();
    const adminToken = await superAdminToken();

    const target = await createStaff(ctx.app, PlatformRole.SUPPORT);
    const targetTokens = await loginStaffTokens(server, target.email);
    // Target is logged in and can call an authed endpoint.
    await request(server)
      .get('/v1/admin/auth/me')
      .set('Authorization', `Bearer ${targetTokens.accessToken}`)
      .expect(200);

    await request(server)
      .delete(`/v1/admin/staff/${target.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(204);

    // Gone from the list (fetch a big page so absence isn't just "on page 2").
    const listRes = await request(server)
      .get('/v1/admin/staff?pageSize=100')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const emails = asSuccess<{ items: StaffRow[] }>(
      listRes.body,
    ).data.items.map((r) => r.email);
    expect(emails).not.toContain(target.email);

    // Their access token is dead immediately (instant logout).
    await request(server)
      .get('/v1/admin/auth/me')
      .set('Authorization', `Bearer ${targetTokens.accessToken}`)
      .expect(401);
  });

  it('returns 404 STAFF_NOT_FOUND for an unknown id', async () => {
    const adminToken = await superAdminToken();
    const res = await request(ctx.app.getHttpServer())
      .delete('/v1/admin/staff/00000000-0000-4000-8000-000000000000')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(404);
    expect(asError(res.body).error.code).toBe('STAFF_NOT_FOUND');
  });

  it('forbids a non-SUPER_ADMIN from removing staff with 403', async () => {
    const server = ctx.app.getHttpServer();
    const support = await createStaff(ctx.app, PlatformRole.SUPPORT);
    const supportToken = await loginStaff(server, support.email);
    const victim = await createStaff(ctx.app, PlatformRole.READ_ONLY);

    await request(server)
      .delete(`/v1/admin/staff/${victim.id}`)
      .set('Authorization', `Bearer ${supportToken}`)
      .expect(403);
  });

  it('prevents removing your own account with 400 STAFF_SELF_ACTION', async () => {
    const server = ctx.app.getHttpServer();
    const admin = await createStaff(ctx.app, PlatformRole.SUPER_ADMIN);
    const token = await loginStaff(server, admin.email);

    const res = await request(server)
      .delete(`/v1/admin/staff/${admin.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
    expect(asError(res.body).error.code).toBe('STAFF_SELF_ACTION');
  });
});
