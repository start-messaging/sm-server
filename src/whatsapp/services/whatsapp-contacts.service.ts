import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppException } from '../../common/exceptions/app.exception';
import { parseMobileOrThrow } from '../../common/phone/parse-mobile';
import { WaContact } from '../entities/wa-contact.entity';
import { WaContactNote } from '../entities/wa-contact-note.entity';

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
  attributes?: Record<string, unknown>;
  followUpAt?: string | null;
  pipelineStageId?: string | null;
  assignedToUserId?: string | null;
}

@Injectable()
export class WhatsappContactsService {
  constructor(
    @InjectRepository(WaContact)
    private readonly contacts: Repository<WaContact>,
    @InjectRepository(WaContactNote)
    private readonly notes: Repository<WaContactNote>,
  ) {}

  async list(workspaceId: string) {
    const [contacts, total] = await this.contacts.findAndCount({
      where: { workspaceId },
      order: { createdAt: 'DESC' },
    });
    return { contacts: contacts.map((c) => this.serialize(c)), total };
  }

  async create(workspaceId: string, input: CreateContactInput) {
    const { e164 } = parseMobileOrThrow(input.phoneE164);

    const existing = await this.contacts.findOne({
      where: { workspaceId, phoneE164: e164 },
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
      phoneE164: e164,
      email: input.email ?? null,
      tags: input.tags ?? [],
      optedIn: true,
      source: 'manual',
      attributes: {},
    });
    await this.contacts.save(contact);
    return this.serialize(contact);
  }

  async getById(workspaceId: string, id: string) {
    const contact = await this.requireContact(workspaceId, id);
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
    if (input.attributes !== undefined) contact.attributes = input.attributes;
    if (input.followUpAt !== undefined) {
      contact.followUpAt = input.followUpAt ? new Date(input.followUpAt) : null;
    }
    if (input.pipelineStageId !== undefined)
      contact.pipelineStageId = input.pipelineStageId ?? null;
    if (input.assignedToUserId !== undefined)
      contact.assignedToUserId = input.assignedToUserId ?? null;

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
      let e164: string;
      try {
        ({ e164 } = parseMobileOrThrow(row.phoneE164));
      } catch {
        skipped++;
        continue;
      }

      const existing = await this.contacts.findOne({
        where: { workspaceId, phoneE164: e164 },
      });
      if (existing) {
        skipped++;
        continue;
      }

      const contact = this.contacts.create({
        workspaceId,
        name: row.name ?? null,
        phoneE164: e164,
        email: row.email ?? null,
        tags: row.tags ? row.tags.split(',').map((t) => t.trim()) : [],
        optedIn: true,
        source: 'csv',
        attributes: {},
      });
      await this.contacts.save(contact);
      imported++;
    }

    return { imported, skipped };
  }

  async listNotes(workspaceId: string, contactId: string) {
    await this.requireContact(workspaceId, contactId);
    const notes = await this.notes.find({
      where: { workspaceId, contactId },
      order: { createdAt: 'DESC' },
    });
    return {
      notes: notes.map((n) => ({
        id: n.id,
        contactId: n.contactId,
        body: n.body,
        authorUserId: n.authorUserId,
        createdAt: n.createdAt.toISOString(),
      })),
    };
  }

  async createNote(
    workspaceId: string,
    contactId: string,
    body: string,
    authorUserId: string,
  ) {
    await this.requireContact(workspaceId, contactId);
    const note = this.notes.create({
      workspaceId,
      contactId,
      body,
      authorUserId,
    });
    await this.notes.save(note);
    return {
      id: note.id,
      contactId: note.contactId,
      body: note.body,
      authorUserId: note.authorUserId,
      createdAt: note.createdAt.toISOString(),
    };
  }

  private async requireContact(
    workspaceId: string,
    contactId: string,
  ): Promise<WaContact> {
    const contact = await this.contacts.findOne({
      where: { id: contactId, workspaceId },
    });
    if (!contact) {
      throw new AppException(
        { code: 'CONTACT_NOT_FOUND', message: 'Contact not found' },
        404,
      );
    }
    return contact;
  }

  private serialize(c: WaContact) {
    return {
      id: c.id,
      name: c.name,
      phoneE164: c.phoneE164,
      email: c.email,
      tags: c.tags,
      optedIn: c.optedIn,
      source: c.source,
      attributes: c.attributes,
      pipelineStageId: c.pipelineStageId,
      followUpAt: c.followUpAt?.toISOString() ?? null,
      assignedToUserId: c.assignedToUserId,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    };
  }
}
