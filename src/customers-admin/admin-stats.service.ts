import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WabaAccount } from '../whatsapp/entities/waba-account.entity';
import { Workspace, WorkspaceStatus } from '../workspaces/entities/workspace.entity';

export interface AdminStats {
  totalWorkspaces: number;
  totalWabas: number;
  planBreakdown: { planCode: string; count: number }[];
  newWorkspacesLast30Days: number;
}

@Injectable()
export class AdminStatsService {
  constructor(
    @InjectRepository(Workspace)
    private readonly workspaces: Repository<Workspace>,
    @InjectRepository(WabaAccount)
    private readonly wabas: Repository<WabaAccount>,
  ) {}

  async getStats(): Promise<AdminStats> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [totalWorkspaces, totalWabas, planRows, recentCount] =
      await Promise.all([
        this.workspaces.count({
          where: { status: WorkspaceStatus.ACTIVE },
        }),
        this.wabas.count(),
        this.workspaces
          .createQueryBuilder('w')
          .innerJoin('w.plan', 'p')
          .where('w.status = :status', { status: WorkspaceStatus.ACTIVE })
          .select('p.code', 'planCode')
          .addSelect('COUNT(w.id)', 'count')
          .groupBy('p.code')
          .getRawMany<{ planCode: string; count: string }>(),
        this.workspaces.count({
          where: { status: WorkspaceStatus.ACTIVE },
        }),
      ]);

    // Separate query for new workspaces — TypeORM's where doesn't support date comparisons easily
    const newCount = await this.workspaces
      .createQueryBuilder('w')
      .where('w.status = :status', { status: WorkspaceStatus.ACTIVE })
      .andWhere('w.createdAt >= :since', { since: thirtyDaysAgo })
      .getCount();

    return {
      totalWorkspaces,
      totalWabas,
      planBreakdown: planRows.map((r) => ({
        planCode: r.planCode,
        count: Number(r.count),
      })),
      newWorkspacesLast30Days: newCount,
    };
  }
}
