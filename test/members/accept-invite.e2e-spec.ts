import { getRepositoryToken } from '@nestjs/typeorm';
import request from 'supertest';
import { Repository } from 'typeorm';
import { registerOnboardedUser, registerVerifiedUser } from '../helpers/auth';
import { createTestApp, TestAppContext } from '../helpers/create-test-app';
import { asError, asSuccess } from '../helpers/envelope';
import { inviteMember } from '../helpers/members';
import {
  createWorkspace,
  ensureFreePlan,
  seedAvailableServiceIN,
} from '../helpers/workspaces';
import { WorkspaceInvitation } from '../../src/members/entities/workspace-invitation.entity';
import { WorkspaceRole } from '../../src/workspaces/entities/workspace-member.entity';

describe('POST /v1/invitations/:token/accept (existing user)', () => {
  let ctx: TestAppContext;
  let serviceKey: string;
  let ownerToken: string;
  let slug: string;
  let invitations: Repository<WorkspaceInvitation>;

  beforeAll(async () => {
    ctx = await createTestApp();
    await ensureFreePlan(ctx.app);
    serviceKey = await seedAvailableServiceIN(ctx.app);
    const owner = await registerOnboardedUser(ctx.app, ctx.app.getHttpServer());
    ownerToken = owner.accessToken;
    slug = (
      await createWorkspace(ctx.app.getHttpServer(), ownerToken, serviceKey)
    ).slug;
    invitations = ctx.app.get<Repository<WorkspaceInvitation>>(
      getRepositoryToken(WorkspaceInvitation),
    );
  });

  afterAll(async () => {
    await ctx.close();
  });

  const accept = (token: string, auth: string) =>
    request(ctx.app.getHttpServer())
      .post(`/v1/invitations/${token}/accept`)
      .set('Authorization', `Bearer ${auth}`);

  it('an invited existing user accepts and becomes a member', async () => {
    const invitee = await registerVerifiedUser(ctx.app.getHttpServer());
    const { inviteToken } = await inviteMember(
      ctx.app.getHttpServer(),
      ownerToken,
      slug,
      { email: invitee.email, role: WorkspaceRole.AGENT },
    );

    const res = await accept(inviteToken!, invitee.accessToken).expect(201);
    expect(asSuccess<{ slug: string }>(res.body).data.slug).toBe(slug);

    // Now a member: the workspace resolves for them.
    await request(ctx.app.getHttpServer())
      .get(`/v1/workspaces/${slug}`)
      .set('Authorization', `Bearer ${invitee.accessToken}`)
      .expect(200);
  });

  it('403s when the logged-in email does not match the invite', async () => {
    const { inviteToken } = await inviteMember(
      ctx.app.getHttpServer(),
      ownerToken,
      slug,
      { email: 'someone-else@example.com', role: WorkspaceRole.VIEWER },
    );
    const wrong = await registerVerifiedUser(ctx.app.getHttpServer());
    const res = await accept(inviteToken!, wrong.accessToken).expect(403);
    expect(asError(res.body).error.code).toBe('INVITE_EMAIL_MISMATCH');
  });

  it('400s an expired or already-used invite', async () => {
    const invitee = await registerVerifiedUser(ctx.app.getHttpServer());
    const { inviteToken, invitation } = await inviteMember(
      ctx.app.getHttpServer(),
      ownerToken,
      slug,
      { email: invitee.email, role: WorkspaceRole.VIEWER },
    );
    // Backdate the expiry → invalid.
    await invitations.update(
      { id: invitation.invitationId },
      { expiresAt: new Date(Date.now() - 1000) },
    );
    const expired = await accept(inviteToken!, invitee.accessToken).expect(400);
    expect(asError(expired.body).error.code).toBe('INVITE_INVALID');

    // A fresh invite that is consumed cannot be reused.
    const again = await inviteMember(
      ctx.app.getHttpServer(),
      ownerToken,
      slug,
      { email: invitee.email, role: WorkspaceRole.VIEWER },
    );
    await accept(again.inviteToken!, invitee.accessToken).expect(201);
    await accept(again.inviteToken!, invitee.accessToken).expect(400);
  });
});
