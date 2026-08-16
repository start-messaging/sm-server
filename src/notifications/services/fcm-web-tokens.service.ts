import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FcmWebToken } from '../entities/fcm-web-token.entity';

@Injectable()
export class FcmWebTokensService {
  constructor(
    @InjectRepository(FcmWebToken)
    private readonly repo: Repository<FcmWebToken>,
  ) {}

  async register(
    userId: string,
    token: string,
    userAgent: string | null,
  ): Promise<{ id: string }> {
    const existing = await this.repo.findOne({
      where: { token },
      withDeleted: true,
    });

    if (existing) {
      if (existing.deletedAt) {
        existing.deletedAt = null;
      }
      existing.userId = userId;
      existing.userAgent = userAgent;
      existing.lastSeenAt = new Date();
      await this.repo.save(existing);
      return { id: existing.id };
    }

    const row = this.repo.create({
      userId,
      token,
      userAgent,
      lastSeenAt: new Date(),
    });
    await this.repo.save(row);
    return { id: row.id };
  }

  async unregister(userId: string, token: string): Promise<void> {
    const existing = await this.repo.findOne({ where: { token, userId } });
    if (existing) {
      await this.repo.softRemove(existing);
    }
  }

  async unregisterAllForUser(userId: string): Promise<void> {
    const rows = await this.repo.find({ where: { userId } });
    if (rows.length) {
      await this.repo.softRemove(rows);
    }
  }
}
