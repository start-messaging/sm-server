import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { paginate, type Paginated } from '../../common/types/pagination';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import {
  MemberStatus,
  WorkspaceMember,
  WorkspaceRole,
} from '../../workspaces/entities/workspace-member.entity';
import { Workspace } from '../../workspaces/entities/workspace.entity';
import {
  PhoneNumber,
  WaPhoneNumberStatus,
} from '../entities/phone-number.entity';
import {
  WabaAccount,
  WabaAccountStatus,
} from '../entities/waba-account.entity';

export interface AdminConnectedWabaRow {
  workspaceId: string;
  workspaceName: string;
  workspaceSlug: string;
  ownerEmail: string | null;
  metaWabaId: string | null;
  businessName: string | null;
  wabaStatus: WabaAccountStatus | null;
  verificationStatus: WabaAccount['verificationStatus'] | null;
  phoneNumbers: {
    displayNumberE164: string;
    qualityRating: PhoneNumber['qualityRating'];
    status: WaPhoneNumberStatus;
  }[];
  connectedAt: string | null;
}

@Injectable()
export class AdminConnectedWabasService {
  constructor(
    @InjectRepository(WabaAccount)
    private readonly wabaAccounts: Repository<WabaAccount>,
    @InjectRepository(PhoneNumber)
    private readonly phoneNumbers: Repository<PhoneNumber>,
    @InjectRepository(Workspace)
    private readonly workspaces: Repository<Workspace>,
    @InjectRepository(WorkspaceMember)
    private readonly members: Repository<WorkspaceMember>,
  ) {}

  async list(
    query: PaginationQueryDto,
  ): Promise<Paginated<AdminConnectedWabaRow>> {
    // Ops list: every linked WABA (active/suspended/disconnected), newest first.
    const [wabas, total] = await this.wabaAccounts.findAndCount({
      where: { serviceKey: 'whatsapp' },
      order: { createdAt: 'DESC' },
      skip: query.skip,
      take: query.take,
    });

    if (wabas.length === 0) {
      return paginate([], total, query);
    }

    const workspaceIds = [...new Set(wabas.map((w) => w.workspaceId))];
    const wabaIds = wabas.map((w) => w.id);

    const [workspaces, owners, phones] = await Promise.all([
      this.workspaces.find({ where: { id: In(workspaceIds) } }),
      this.members.find({
        where: {
          workspaceId: In(workspaceIds),
          role: WorkspaceRole.OWNER,
          status: MemberStatus.ACTIVE,
        },
        relations: { user: true },
      }),
      this.phoneNumbers.find({
        where: { wabaAccountId: In(wabaIds) },
        order: { createdAt: 'ASC' },
      }),
    ]);

    const wsById = new Map(workspaces.map((w) => [w.id, w]));
    const ownerByWs = new Map(
      owners.map((m) => [m.workspaceId, m.user?.email ?? null]),
    );
    const phonesByWaba = new Map<string, PhoneNumber[]>();
    for (const p of phones) {
      const list = phonesByWaba.get(p.wabaAccountId) ?? [];
      list.push(p);
      phonesByWaba.set(p.wabaAccountId, list);
    }

    const items: AdminConnectedWabaRow[] = wabas.map((waba) => {
      const ws = wsById.get(waba.workspaceId);
      const phoneRows = phonesByWaba.get(waba.id) ?? [];
      return {
        workspaceId: waba.workspaceId,
        workspaceName: ws?.name ?? '—',
        workspaceSlug: ws?.slug ?? '—',
        ownerEmail: ownerByWs.get(waba.workspaceId) ?? null,
        metaWabaId: waba.metaWabaId,
        businessName: waba.businessName,
        wabaStatus: waba.status,
        verificationStatus: waba.verificationStatus,
        phoneNumbers: phoneRows.map((p) => ({
          displayNumberE164: p.displayNumberE164,
          qualityRating: p.qualityRating,
          status: p.status,
        })),
        connectedAt: waba.createdAt?.toISOString() ?? null,
      };
    });

    return paginate(items, total, query);
  }
}
