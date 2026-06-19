import request from 'supertest';
import {
  DEFAULT_PASSWORD,
  registerOnboardedUser,
  registerVerifiedUser,
  uniqueEmail,
} from '../helpers/auth';
import { createTestApp, TestAppContext } from '../helpers/create-test-app';
import { asError, asSuccess } from '../helpers/envelope';
import { inviteMember } from '../helpers/members';
import {
  createWorkspace,
  ensureFreePlan,
  seedAvailableServiceIN,
} from '../helpers/workspaces';
import { WorkspaceRole } from '../../src/workspaces/entities/workspace-member.entity';

interface ClaimResult {
  accessToken: string;
  refreshToken: string;
  user: { email: string; emailVerified: boolean; mobileVerified: boolean };
  slug: string;
}

describe('Invitation preview + claim (brand-new email)', () => {
  let ctx: TestAppContext;
  let serviceKey: string;
  let ownerToken: string;
  let slug: string;

  beforeAll(async () => {
    ctx = await createTestApp();
    await ensureFreePlan(ctx.app);
    serviceKey = await seedAvailableServiceIN(ctx.app);
    const owner = await registerOnboardedUser(ctx.app, ctx.app.getHttpServer());
    ownerToken = owner.accessToken;
    slug = (
      await createWorkspace(ctx.app.getHttpServer(), ownerToken, serviceKey)
    ).slug;
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('previews then claims: account is created, joined, logged in — no mobile required', async () => {
    const email = uniqueEmail('newbie');
    const { inviteToken } = await inviteMember(
      ctx.app.getHttpServer(),
      ownerToken,
      slug,
      { email, role: WorkspaceRole.AGENT },
    );

    const preview = await request(ctx.app.getHttpServer())
      .get(`/v1/invitations/${inviteToken}`)
      .expect(200);
    expect(
      asSuccess<{ accountExists: boolean; email: string }>(preview.body).data,
    ).toMatchObject({ accountExists: false, email });

    const res = await request(ctx.app.getHttpServer())
      .post(`/v1/invitations/${inviteToken}/claim`)
      .send({ fullName: 'New Bie', password: DEFAULT_PASSWORD })
      .expect(201);
    const claim = asSuccess<ClaimResult>(res.body).data;
    expect(claim.slug).toBe(slug);
    expect(claim.user).toMatchObject({
      email,
      emailVerified: true,
      mobileVerified: false,
    });

    // The issued session works AND is not bounced to onboarding — the new
    // member reaches the workspace with just a verified email.
    await request(ctx.app.getHttpServer())
      .get(`/v1/workspaces/${slug}`)
      .set('Authorization', `Bearer ${claim.accessToken}`)
      .expect(200);
  });

  it('409s a claim when the email already has an account (use accept instead)', async () => {
    const existing = await registerVerifiedUser(ctx.app.getHttpServer());
    const { inviteToken } = await inviteMember(
      ctx.app.getHttpServer(),
      ownerToken,
      slug,
      { email: existing.email, role: WorkspaceRole.VIEWER },
    );
    const res = await request(ctx.app.getHttpServer())
      .post(`/v1/invitations/${inviteToken}/claim`)
      .send({ fullName: 'Dupe', password: DEFAULT_PASSWORD })
      .expect(409);
    expect(asError(res.body).error.code).toBe('EMAIL_TAKEN');
  });
});
