import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppException } from '../../common/exceptions/app.exception';
import { WaInboxSettings } from '../entities/wa-inbox-settings.entity';
import {
  WorkspaceMember,
  WorkspaceRole,
  ROLE_RANK,
} from '../../workspaces/entities/workspace-member.entity';

@Injectable()
export class WhatsappInboxSettingsService {
  constructor(
    @InjectRepository(WaInboxSettings)
    private readonly settings: Repository<WaInboxSettings>,
    @InjectRepository(WorkspaceMember)
    private readonly members: Repository<WorkspaceMember>,
  ) {}

  async get(workspaceId: string, callerUserId: string) {
    let row = await this.settings.findOne({ where: { workspaceId } });
    if (!row) {
      row = this.settings.create({
        workspaceId,
        roundRobinEnabled: false,
        lastRoutedUserId: null,
      });
      await this.settings.save(row);
    }

    const membership = await this.members.findOne({
      where: { workspaceId, userId: callerUserId },
    });

    return this.serialize(row, membership?.inboxAvailable ?? true);
  }

  async patch(
    workspaceId: string,
    callerMembership: WorkspaceMember,
    input: { roundRobinEnabled?: boolean; inboxAvailable?: boolean },
  ) {
    const isAdmin =
      ROLE_RANK[callerMembership.role] >= ROLE_RANK[WorkspaceRole.ADMIN];

    if (input.roundRobinEnabled !== undefined && !isAdmin) {
      throw new AppException(
        {
          code: 'WORKSPACE_ROLE_FORBIDDEN',
          message: 'Only admins can change round-robin settings',
        },
        403,
      );
    }

    let row = await this.settings.findOne({ where: { workspaceId } });
    if (!row) {
      row = this.settings.create({
        workspaceId,
        roundRobinEnabled: false,
        lastRoutedUserId: null,
      });
    }
    if (input.roundRobinEnabled !== undefined) {
      row.roundRobinEnabled = input.roundRobinEnabled;
    }
    await this.settings.save(row);

    let inboxAvailable = callerMembership.inboxAvailable;
    if (input.inboxAvailable !== undefined) {
      await this.members.update(callerMembership.id, {
        inboxAvailable: input.inboxAvailable,
      });
      inboxAvailable = input.inboxAvailable;
    }

    return this.serialize(row, inboxAvailable);
  }

  private serialize(s: WaInboxSettings, inboxAvailable: boolean) {
    return {
      id: s.id,
      workspaceId: s.workspaceId,
      roundRobinEnabled: s.roundRobinEnabled,
      lastRoutedUserId: s.lastRoutedUserId,
      inboxAvailable,
    };
  }
}
