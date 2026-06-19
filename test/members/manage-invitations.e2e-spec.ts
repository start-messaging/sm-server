import request from 'supertest';
import { registerOnboardedUser, uniqueEmail } from '../helpers/auth';
import { createTestApp, TestAppContext } from '../helpers/create-test-app';
import { asError } from '../helpers/envelope';
import { inviteMember } from '../helpers/members';
import {
  createWorkspace,
  ensureFreePlan,
  seedAvailableServiceIN,
} from '../helpers/workspaces';
import { WorkspaceRole } from '../../src/workspaces/entities/workspace-member.entity';

describe('Manage invitations (revoke + resend)', () => {
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

  it('revoke invalidates a pending invite token', async () => {
    const { invitation, inviteToken } = await inviteMember(
      ctx.app.getHttpServer(),
      ownerToken,
      slug,
      { email: uniqueEmail('revoke'), role: WorkspaceRole.VIEWER },
    );
    await request(ctx.app.getHttpServer())
      .delete(
        `/v1/workspaces/${slug}/members/invitations/${invitation.invitationId}`,
      )
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(204);

    // The link no longer previews.
    const res = await request(ctx.app.getHttpServer())
      .get(`/v1/invitations/${inviteToken}`)
      .expect(400);
    expect(asError(res.body).error.code).toBe('INVITE_INVALID');
  });

  it('resend issues a new token and invalidates the old one', async () => {
    const { invitation, inviteToken } = await inviteMember(
      ctx.app.getHttpServer(),
      ownerToken,
      slug,
      { email: uniqueEmail('resend'), role: WorkspaceRole.VIEWER },
    );
    const res = await request(ctx.app.getHttpServer())
      .post(
        `/v1/workspaces/${slug}/members/invitations/${invitation.invitationId}/resend`,
      )
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(201);
    const newToken = (res.body as { data: { inviteToken: string } }).data
      .inviteToken;
    expect(newToken).toBeTruthy();
    expect(newToken).not.toBe(inviteToken);

    // Old token dead, new token previews.
    await request(ctx.app.getHttpServer())
      .get(`/v1/invitations/${inviteToken}`)
      .expect(400);
    await request(ctx.app.getHttpServer())
      .get(`/v1/invitations/${newToken}`)
      .expect(200);
  });
});
