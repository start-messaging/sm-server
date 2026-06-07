import request from 'supertest';
import { PlatformRole } from '../../src/admin/enums/platform-role.enum';
import { createStaff, loginStaff } from '../helpers/admin';
import { DEFAULT_PASSWORD, uniqueEmail } from '../helpers/auth';
import { createTestApp, TestAppContext } from '../helpers/create-test-app';
import { asError, asSuccess } from '../helpers/envelope';

describe('POST /v1/admin/auth/accept-invite', () => {
  let ctx: TestAppContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.close();
  });

  /** Invite a staff member (as SUPER_ADMIN) and return the dev invite token. */
  const invite = async (email: string): Promise<string> => {
    const admin = await createStaff(ctx.app, PlatformRole.SUPER_ADMIN);
    const adminToken = await loginStaff(ctx.app.getHttpServer(), admin.email);
    const res = await request(ctx.app.getHttpServer())
      .post('/v1/admin/staff')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email, fullName: 'Invitee', platformRole: PlatformRole.SUPPORT })
      .expect(201);
    return asSuccess<{ inviteToken: string }>(res.body).data.inviteToken;
  };

  it('sets the password, activates the account, and logs in', async () => {
    const email = uniqueEmail('invitee');
    const token = await invite(email);

    const res = await request(ctx.app.getHttpServer())
      .post('/v1/admin/auth/accept-invite')
      .send({ token, password: DEFAULT_PASSWORD })
      .expect(200);

    const body = asSuccess<{
      accessToken: string;
      refreshToken: string;
      staff: { status: string };
    }>(res.body);
    expect(body.data.accessToken).toEqual(expect.any(String));
    expect(body.data.staff.status).toBe('active');

    // The invited staff can now log in with the password they set.
    await request(ctx.app.getHttpServer())
      .post('/v1/admin/auth/login')
      .send({ email, password: DEFAULT_PASSWORD })
      .expect(200);
  });

  it('rejects an unknown/expired invite token with 400 INVITE_INVALID', async () => {
    const res = await request(ctx.app.getHttpServer())
      .post('/v1/admin/auth/accept-invite')
      .send({ token: 'not-a-real-token', password: DEFAULT_PASSWORD })
      .expect(400);
    expect(asError(res.body).error.code).toBe('INVITE_INVALID');
  });
});
