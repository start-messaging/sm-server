import request from 'supertest';
import { PlatformRole } from '../../src/admin/enums/platform-role.enum';
import { createStaff, loginStaff } from '../helpers/admin';
import { uniqueEmail } from '../helpers/auth';
import { createTestApp, TestAppContext } from '../helpers/create-test-app';
import { asError, asSuccess } from '../helpers/envelope';

describe('POST /v1/admin/staff (invite)', () => {
  let ctx: TestAppContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('lets a SUPER_ADMIN invite a new staff member (status invited)', async () => {
    const admin = await createStaff(ctx.app, PlatformRole.SUPER_ADMIN);
    const token = await loginStaff(ctx.app.getHttpServer(), admin.email);

    const newEmail = uniqueEmail('rm');
    const res = await request(ctx.app.getHttpServer())
      .post('/v1/admin/staff')
      .set('Authorization', `Bearer ${token}`)
      .send({
        email: newEmail,
        fullName: 'New RM',
        platformRole: PlatformRole.RELATIONSHIP_MANAGER,
      })
      .expect(201);

    const body = asSuccess<{
      staff: { email: string; platformRole: string; status: string };
      inviteToken: string;
    }>(res.body);
    expect(body.data.staff.email).toBe(newEmail);
    expect(body.data.staff.platformRole).toBe(
      PlatformRole.RELATIONSHIP_MANAGER,
    );
    expect(body.data.staff.status).toBe('invited');
    expect(body.data.inviteToken).toEqual(expect.any(String));
  });

  it('rejects a duplicate staff email with 409 STAFF_EMAIL_TAKEN', async () => {
    const admin = await createStaff(ctx.app, PlatformRole.SUPER_ADMIN);
    const token = await loginStaff(ctx.app.getHttpServer(), admin.email);
    const dupEmail = uniqueEmail('dupstaff');

    const invite = () =>
      request(ctx.app.getHttpServer())
        .post('/v1/admin/staff')
        .set('Authorization', `Bearer ${token}`)
        .send({
          email: dupEmail,
          fullName: 'Dup',
          platformRole: PlatformRole.SUPPORT,
        });

    await invite().expect(201);
    const res = await invite().expect(409);
    expect(asError(res.body).error.code).toBe('STAFF_EMAIL_TAKEN');
  });

  it('forbids a non-SUPER_ADMIN from inviting staff with 403', async () => {
    const finance = await createStaff(ctx.app, PlatformRole.FINANCE);
    const token = await loginStaff(ctx.app.getHttpServer(), finance.email);

    await request(ctx.app.getHttpServer())
      .post('/v1/admin/staff')
      .set('Authorization', `Bearer ${token}`)
      .send({
        email: uniqueEmail('nope'),
        fullName: 'Nope',
        platformRole: PlatformRole.SUPPORT,
      })
      .expect(403);
  });
});
