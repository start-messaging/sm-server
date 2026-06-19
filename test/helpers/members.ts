import type { INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import request from 'supertest';
import type { App } from 'supertest/types';
import { Repository } from 'typeorm';
import { User } from '../../src/users/entities/user.entity';
import {
  MemberStatus,
  WorkspaceMember,
  WorkspaceRole,
} from '../../src/workspaces/entities/workspace-member.entity';
import { registerVerifiedUser } from './auth';
import { asSuccess } from './envelope';

export interface InvitationResult {
  invitation: { invitationId: string; email: string; role: string };
  inviteToken?: string;
}

/** POST an invite as `token`; returns the invitation + dev token (non-prod). */
export async function inviteMember(
  server: App,
  token: string,
  slug: string,
  body: { email: string; role: WorkspaceRole },
): Promise<InvitationResult> {
  const res = await request(server)
    .post(`/v1/workspaces/${slug}/members/invitations`)
    .set('Authorization', `Bearer ${token}`)
    .send(body)
    .expect(201);
  return asSuccess<InvitationResult>(res.body).data;
}

/**
 * A logged-in member of any role, seeded directly. Registers a verified user
 * (email-only — no mobile needed to be a MEMBER) and inserts their membership
 * row, returning their id/email/token so they can act in RBAC tests.
 */
export async function seedWorkspaceMember(
  app: INestApplication,
  server: App,
  workspaceId: string,
  role: WorkspaceRole,
): Promise<{
  userId: string;
  memberId: string;
  email: string;
  accessToken: string;
}> {
  const user = await registerVerifiedUser(server);
  const userRepo = app.get<Repository<User>>(getRepositoryToken(User));
  const row = await userRepo.findOneByOrFail({ email: user.email });
  const memberRepo = app.get<Repository<WorkspaceMember>>(
    getRepositoryToken(WorkspaceMember),
  );
  const member = await memberRepo.save(
    memberRepo.create({
      workspaceId,
      userId: row.id,
      role,
      status: MemberStatus.ACTIVE,
      invitedBy: null,
      joinedAt: new Date(),
    }),
  );
  return {
    userId: row.id,
    memberId: member.id,
    email: user.email,
    accessToken: user.accessToken,
  };
}
