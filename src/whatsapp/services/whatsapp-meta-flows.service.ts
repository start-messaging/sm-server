import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppException } from '../../common/exceptions/app.exception';
import { decryptToken } from '../crypto/token-encryption';
import { WabaAccount } from '../entities/waba-account.entity';
import { WaMetaFlow } from '../entities/wa-meta-flow.entity';
import { MetaGraphClient } from './meta-graph.client';

@Injectable()
export class WhatsappMetaFlowsService {
  constructor(
    @InjectRepository(WaMetaFlow)
    private readonly metaFlows: Repository<WaMetaFlow>,
    @InjectRepository(WabaAccount)
    private readonly wabaAccounts: Repository<WabaAccount>,
    private readonly meta: MetaGraphClient,
  ) {}

  async list(workspaceId: string): Promise<WaMetaFlow[]> {
    return this.metaFlows.find({
      where: { workspaceId },
      order: { name: 'ASC' },
    });
  }

  async sync(workspaceId: string): Promise<WaMetaFlow[]> {
    const waba = await this.wabaAccounts.findOne({
      where: { workspaceId, serviceKey: 'whatsapp' },
    });
    if (!waba) {
      throw new AppException(
        { code: 'WABA_NOT_CONNECTED', message: 'No WABA connected' },
        404,
      );
    }

    const accessToken = decryptToken(waba.accessTokenEncrypted);
    const flows = await this.meta.listMetaFlows(waba.metaWabaId, accessToken);

    for (const f of flows) {
      await this.metaFlows.upsert(
        {
          workspaceId,
          metaFlowId: f.id,
          name: f.name,
          status: f.status,
          categories: f.categories,
          syncedAt: new Date(),
        },
        { conflictPaths: ['workspaceId', 'metaFlowId'] },
      );
    }

    return this.list(workspaceId);
  }
}
