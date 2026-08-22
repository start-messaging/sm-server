import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppException } from '../../common/exceptions/app.exception';
import { WaQuickReply } from '../entities/wa-quick-reply.entity';

@Injectable()
export class WhatsappQuickRepliesService {
  constructor(
    @InjectRepository(WaQuickReply)
    private readonly quickReplies: Repository<WaQuickReply>,
  ) {}

  async list(workspaceId: string) {
    const rows = await this.quickReplies.find({
      where: { workspaceId },
      order: { createdAt: 'ASC' },
    });
    return { quickReplies: rows.map((qr) => this.serialize(qr)) };
  }

  async create(
    workspaceId: string,
    input: { title: string; body: string; shortcut: string },
  ) {
    const shortcut = input.shortcut.replace(/^\/+/, '');
    const existing = await this.quickReplies.findOne({
      where: { workspaceId, shortcut },
    });
    if (existing) {
      throw new AppException(
        {
          code: 'QUICK_REPLY_DUPLICATE',
          message: `Shortcut "${shortcut}" already exists`,
        },
        409,
      );
    }
    const qr = this.quickReplies.create({
      workspaceId,
      title: input.title,
      body: input.body,
      shortcut,
    });
    await this.quickReplies.save(qr);
    return this.serialize(qr);
  }

  async update(
    workspaceId: string,
    id: string,
    input: { title?: string; body?: string; shortcut?: string },
  ) {
    const qr = await this.quickReplies.findOne({
      where: { id, workspaceId },
    });
    if (!qr) {
      throw new AppException(
        { code: 'QUICK_REPLY_NOT_FOUND', message: 'Quick reply not found' },
        404,
      );
    }
    if (input.title !== undefined) qr.title = input.title;
    if (input.body !== undefined) qr.body = input.body;
    if (input.shortcut !== undefined) {
      const shortcut = input.shortcut.replace(/^\/+/, '');
      const dup = await this.quickReplies.findOne({
        where: { workspaceId, shortcut },
      });
      if (dup && dup.id !== id) {
        throw new AppException(
          {
            code: 'QUICK_REPLY_DUPLICATE',
            message: `Shortcut "${shortcut}" already exists`,
          },
          409,
        );
      }
      qr.shortcut = shortcut;
    }
    await this.quickReplies.save(qr);
    return this.serialize(qr);
  }

  async delete(workspaceId: string, id: string): Promise<void> {
    const qr = await this.quickReplies.findOne({
      where: { id, workspaceId },
    });
    if (!qr) {
      throw new AppException(
        { code: 'QUICK_REPLY_NOT_FOUND', message: 'Quick reply not found' },
        404,
      );
    }
    await this.quickReplies.softRemove(qr);
  }

  private serialize(qr: WaQuickReply) {
    return {
      id: qr.id,
      title: qr.title,
      body: qr.body,
      shortcut: qr.shortcut,
      createdAt: qr.createdAt.toISOString(),
      updatedAt: qr.updatedAt.toISOString(),
    };
  }
}
