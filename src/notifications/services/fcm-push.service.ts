import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import * as admin from 'firebase-admin';
import { In, Repository } from 'typeorm';
import type { EnvVars } from '../../config/env.validation';
import {
  MemberStatus,
  WorkspaceMember,
} from '../../workspaces/entities/workspace-member.entity';
import { Workspace } from '../../workspaces/entities/workspace.entity';
import { FcmWebToken } from '../entities/fcm-web-token.entity';

export interface InboxPushPayload {
  workspaceId: string;
  conversationId: string;
  contactName?: string | null;
  contactPhone?: string | null;
}

/**
 * Sends FCM Web Push for inbound inbox events.
 * No-ops when FIREBASE_SERVICE_ACCOUNT_JSON is unset (local/dev without Firebase).
 */
@Injectable()
export class FcmPushService implements OnModuleInit {
  private readonly logger = new Logger(FcmPushService.name);
  private ready = false;

  constructor(
    private readonly config: ConfigService<EnvVars, true>,
    @InjectRepository(FcmWebToken)
    private readonly tokens: Repository<FcmWebToken>,
    @InjectRepository(WorkspaceMember)
    private readonly members: Repository<WorkspaceMember>,
    @InjectRepository(Workspace)
    private readonly workspaces: Repository<Workspace>,
  ) {}

  onModuleInit() {
    const raw = this.config.get('FIREBASE_SERVICE_ACCOUNT_JSON', {
      infer: true,
    });
    if (!raw?.trim()) {
      this.logger.log(
        'FCM disabled — set FIREBASE_SERVICE_ACCOUNT_JSON to enable web push',
      );
      return;
    }
    try {
      const trimmed = raw.trim().replace(/^['"]|['"]$/g, '');
      const sa = JSON.parse(trimmed) as admin.ServiceAccount;
      if (!admin.apps.length) {
        admin.initializeApp({ credential: admin.credential.cert(sa) });
      }
      this.ready = true;
      this.logger.log('FCM web push ready');
    } catch (err) {
      this.logger.error(
        `FCM init failed: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  isEnabled(): boolean {
    return this.ready;
  }

  async notifyInboxInbound(payload: InboxPushPayload): Promise<void> {
    if (!this.ready) {
      this.logger.log(
        `FCM skip: not configured (set FIREBASE_SERVICE_ACCOUNT_JSON)`,
      );
      return;
    }

    const workspace = await this.workspaces.findOne({
      where: { id: payload.workspaceId },
    });
    if (!workspace) {
      this.logger.warn(`FCM skip: workspace not found ${payload.workspaceId}`);
      return;
    }

    const members = await this.members.find({
      where: {
        workspaceId: payload.workspaceId,
        status: MemberStatus.ACTIVE,
      },
      select: { userId: true },
    });
    const userIds = [...new Set(members.map((m) => m.userId))];
    if (userIds.length === 0) {
      this.logger.warn(
        `FCM skip: no active members workspace=${workspace.slug}`,
      );
      return;
    }

    const rows = await this.tokens.find({
      where: { userId: In(userIds) },
    });
    if (rows.length === 0) {
      this.logger.log(
        `FCM skip: no registered web tokens for workspace=${workspace.slug} members=${userIds.length}`,
      );
      return;
    }

    this.logger.log(
      `FCM send inbound workspace=${workspace.slug} tokens=${rows.length} conversation=${payload.conversationId}`,
    );

    const title = 'New WhatsApp message';
    const body =
      payload.contactName?.trim() ||
      payload.contactPhone?.trim() ||
      'You have a new message in your inbox.';

    const clientBase = this.config
      .get('CLIENT_APP_URL', { infer: true })
      .replace(/\/$/, '');
    const clickPath = `/w/${workspace.slug}/inbox?c=${payload.conversationId}`;

    const stale: string[] = [];
    let sent = 0;

    await Promise.all(
      rows.map(async (row) => {
        try {
          await admin.messaging().send({
            token: row.token,
            notification: { title, body },
            data: {
              type: 'inbox.inbound',
              workspaceId: payload.workspaceId,
              workspaceSlug: workspace.slug,
              conversationId: payload.conversationId,
              clickPath,
              clickUrl: `${clientBase}${clickPath}`,
            },
            webpush: {
              fcmOptions: {
                link: `${clientBase}${clickPath}`,
              },
              notification: {
                title,
                body,
                icon: '/favicon.ico',
                tag: `inbox-${payload.conversationId}`,
              },
            },
          });
          sent += 1;
        } catch (err) {
          const code =
            err && typeof err === 'object' && 'code' in err
              ? String((err as { code: string }).code)
              : '';
          if (
            code.includes('registration-token-not-registered') ||
            code.includes('invalid-registration-token')
          ) {
            stale.push(row.id);
            this.logger.warn(`FCM stale token removed id=${row.id}`);
          } else {
            this.logger.warn(
              `FCM send failed token=${row.id}: ${
                err instanceof Error ? err.message : err
              }`,
            );
          }
        }
      }),
    );

    if (stale.length > 0) {
      await this.tokens.softDelete({ id: In(stale) });
    }
    this.logger.log(`FCM inbound done sent=${sent} stale=${stale.length}`);
  }
}
