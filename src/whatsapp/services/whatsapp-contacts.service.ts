import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppException } from '../../common/exceptions/app.exception';
import { WaContact } from '../entities/wa-contact.entity';

export interface CreateContactInput {
  name?: string;
  phoneE164: string;
  email?: string;
  tags?: string[];
}

export interface UpdateContactInput {
  name?: string;
  email?: string;
  tags?: string[];
  optedIn?: boolean;
}

@Injectable()
export class WhatsappContactsService {
  constructor(
    @InjectRepository(WaContact)
    private readonly contacts: Repository<WaContact>,
  ) {}

  async list(workspaceId: string) {
    const [contacts, total] = await this.contacts.findAndCount({
      where: { workspaceId },
      order: { createdAt: 'DESC' },
    });
    return { contacts: contacts.map(this.serialize), total };
  }

  async create(workspaceId: string, input: CreateContactInput) {
    const existing = await this.contacts.findOne({
      where: { workspaceId, phoneE164: input.phoneE164 },
    });
    if (existing) {
      throw new AppException(
        {
          code: 'CONTACT_DUPLICATE',
          message: 'A contact with this phone number already exists',
        },
        409,
      );
    }

    const contact = this.contacts.create({
      workspaceId,
      name: input.name ?? null,
      phoneE164: input.phoneE164,
      email: input.email ?? null,
      tags: input.tags ?? [],
      optedIn: true,
    });
    await this.contacts.save(contact);
    return this.serialize(contact);
  }

  async update(workspaceId: string, id: string, input: UpdateContactInput) {
    const contact = await this.contacts.findOne({ where: { id, workspaceId } });
    if (!contact) {
      throw new AppException(
        { code: 'CONTACT_NOT_FOUND', message: 'Contact not found' },
        404,
      );
    }

    if (input.name !== undefined) contact.name = input.name || null;
    if (input.email !== undefined) contact.email = input.email || null;
    if (input.tags !== undefined) contact.tags = input.tags;
    if (input.optedIn !== undefined) contact.optedIn = input.optedIn;

    await this.contacts.save(contact);
    return this.serialize(contact);
  }

  async delete(workspaceId: string, id: string): Promise<void> {
    const contact = await this.contacts.findOne({ where: { id, workspaceId } });
    if (!contact) {
      throw new AppException(
        { code: 'CONTACT_NOT_FOUND', message: 'Contact not found' },
        404,
      );
    }
    await this.contacts.softRemove(contact);
  }

  async importCsv(
    workspaceId: string,
    rows: Array<{
      name?: string;
      phoneE164: string;
      email?: string;
      tags?: string;
    }>,
  ) {
    let imported = 0;
    let skipped = 0;

    for (const row of rows) {
      const existing = await this.contacts.findOne({
        where: { workspaceId, phoneE164: row.phoneE164 },
      });
      if (existing) {
        skipped++;
        continue;
      }

      const contact = this.contacts.create({
        workspaceId,
        name: row.name ?? null,
        phoneE164: row.phoneE164,
        email: row.email ?? null,
        tags: row.tags ? row.tags.split(',').map((t) => t.trim()) : [],
        optedIn: true,
      });
      await this.contacts.save(contact);
      imported++;
    }

    return { imported, skipped };
  }

  private serialize(c: WaContact) {
    return {
      id: c.id,
      name: c.name,
      phoneE164: c.phoneE164,
      email: c.email,
      tags: c.tags,
      optedIn: c.optedIn,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    };
  }
}
