import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, DataSource, EntityManager, Repository } from 'typeorm';
import { AppException } from '../../common/exceptions/app.exception';
import { parseMobileOrThrow } from '../../common/phone/parse-mobile';
import { Plan } from '../../plans/entities/plan.entity';
import { PlanLimitService } from '../../workspaces/plan-limit.service';
import { WaContact } from '../entities/wa-contact.entity';
import { WaContactNote } from '../entities/wa-contact-note.entity';
import { ListContactsQueryDto } from '../dto/list-contacts-query.dto';

/** A CSV row already resolved to contact fields, ready to validate + insert. */
interface NormalizedImportRow {
  phoneE164Raw: string;
  name?: string;
  email?: string;
  tags?: string[];
  attributes?: Record<string, string>;
}

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
    private readonly ds: DataSource,
    private readonly planLimits: PlanLimitService,
  ) {}

  async list(
    workspaceId: string,
    query: ListContactsQueryDto = new ListContactsQueryDto(),
  ) {
    const qb = this.contacts
      .createQueryBuilder('c')
      .where('c.workspace_id = :workspaceId', { workspaceId });

    if (query.search) {
      qb.andWhere('(c.name ILIKE :search OR c.phone_e164 ILIKE :search)', {
        search: `%${query.search}%`,
      });
    }

    if (query.tag?.length) {
      qb.andWhere(
        new Brackets((qb2) => {
          query.tag!.forEach((t, i) => {
            qb2.orWhere(`c.tags @> CAST(:tag${i} AS jsonb)`, {
              [`tag${i}`]: JSON.stringify([t]),
            });
          });
        }),
      );
    }

    if (query.stageId) {
      qb.andWhere('c.pipeline_stage_id = :stageId', { stageId: query.stageId });
    }

    if (query.assigneeId) {
      qb.andWhere('c.assigned_to_user_id = :assigneeId', {
        assigneeId: query.assigneeId,
      });
    }

    if (query.optedIn !== undefined) {
      qb.andWhere('c.opted_in = :optedIn', { optedIn: query.optedIn });
    }

    if (query.hasFollowUp !== undefined) {
      qb.andWhere(
        query.hasFollowUp
          ? 'c.follow_up_at IS NOT NULL'
          : 'c.follow_up_at IS NULL',
      );
    }

    qb.orderBy('c.created_at', 'DESC')
      .skip(query.skip ?? 0)
      .take(query.take ?? 50);

    const [contacts, total] = await qb.getManyAndCount();
    return { contacts: contacts.map((c) => this.serialize(c)), total };
  }

  async create(
    workspaceId: string,
    input: CreateContactInput,
    plan: Plan | undefined,
  ) {
    const { e164 } = parseMobileOrThrow(input.phoneE164);

    return this.ds.transaction(async (em) => {
      // The max_contacts check must be atomic with the insert: a
      // transaction-scoped advisory lock serializes concurrent creates in this
      // workspace, then the count runs inside the same transaction.
      await em.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
        `wa-contact-create:${workspaceId}`,
      ]);
      const repo = em.getRepository(WaContact);

      const existing = await repo.findOne({
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

      if (plan) {
        await this.planLimits.assertCanAddContact(plan, workspaceId, em);
      }

      const contact = repo.create({
        workspaceId,
        name: input.name ?? null,
        phoneE164: e164,
        email: input.email ?? null,
        tags: input.tags ?? [],
        optedIn: true,
        source: 'manual',
        attributes: {},
      });
      await repo.save(contact);
      return this.serialize(contact);
    });
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
    plan: Plan | undefined,
    filenameTag?: string,
  ) {
    const normalized: NormalizedImportRow[] = rows.map((row) => {
      const rowTags = row.tags ? row.tags.split(',').map((t) => t.trim()) : [];
      if (filenameTag) rowTags.push(filenameTag);
      return {
        phoneE164Raw: row.phoneE164,
        name: row.name,
        email: row.email,
        tags: rowTags.length ? rowTags : undefined,
      };
    });
    return this.runImport(workspaceId, plan, normalized);
  }

  /**
   * Field-mapped CSV import (Track 6b): `rows` are raw CSV records keyed by
   * their original column header; `mapping` says which header feeds which
   * contact field (`phone` | `name` | `email` | `tag` | `attr:<key>`).
   * Headers absent from `mapping` are ignored. `phone` is required by the
   * client before submit, but nothing here trusts that — a row with no
   * resolvable phone column is simply skipped like any invalid phone.
   */
  async importMapped(
    workspaceId: string,
    rows: Record<string, string>[],
    mapping: Record<string, string>,
    plan: Plan | undefined,
    filenameTag?: string,
  ) {
    const phoneHeader = Object.keys(mapping).find(
      (h) => mapping[h] === 'phone',
    );
    const nameHeader = Object.keys(mapping).find((h) => mapping[h] === 'name');
    const emailHeader = Object.keys(mapping).find(
      (h) => mapping[h] === 'email',
    );
    const tagHeaders = Object.keys(mapping).filter((h) => mapping[h] === 'tag');
    const attrHeaders = Object.entries(mapping).filter(([, target]) =>
      target.startsWith('attr:'),
    );

    const normalized: NormalizedImportRow[] = rows.map((row) => {
      const attributes: Record<string, string> = {};
      for (const [header, target] of attrHeaders) {
        const key = target.slice('attr:'.length).trim();
        const value = row[header]?.trim();
        if (key && value) attributes[key] = value;
      }
      const tags = tagHeaders
        .flatMap((h) => (row[h] ?? '').split(','))
        .map((t) => t.trim())
        .filter(Boolean);
      if (filenameTag) tags.push(filenameTag);

      return {
        phoneE164Raw: phoneHeader ? (row[phoneHeader] ?? '') : '',
        name: nameHeader ? row[nameHeader] : undefined,
        email: emailHeader ? row[emailHeader] : undefined,
        tags: tags.length ? tags : undefined,
        attributes: Object.keys(attributes).length ? attributes : undefined,
      };
    });

    return this.runImport(workspaceId, plan, normalized);
  }

  /**
   * Shared insert path for both import flavours: one transaction, one
   * per-workspace advisory lock (same key as single-contact `create`, so the
   * two paths can't race each other), sequential per-row validation so a
   * duplicate earlier in the same batch is caught by the next row's lookup.
   * `max_contacts` is enforced per row via `PlanLimitService.assertCanAddContact`
   * — once the plan is at capacity every further row fails the same check, so
   * the loop stops there and counts the rest as skipped rather than importing
   * past the cap.
   */
  private async runImport(
    workspaceId: string,
    plan: Plan | undefined,
    rows: NormalizedImportRow[],
  ): Promise<{ imported: number; skipped: number }> {
    let imported = 0;
    let skipped = 0;

    await this.ds.transaction(async (em: EntityManager) => {
      await em.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
        `wa-contact-create:${workspaceId}`,
      ]);
      const repo = em.getRepository(WaContact);

      for (const [i, row] of rows.entries()) {
        let e164: string;
        try {
          ({ e164 } = parseMobileOrThrow(row.phoneE164Raw));
        } catch {
          skipped++;
          continue;
        }

        const existing = await repo.findOne({
          where: { workspaceId, phoneE164: e164 },
        });
        if (existing) {
          skipped++;
          continue;
        }

        if (plan) {
          try {
            await this.planLimits.assertCanAddContact(plan, workspaceId, em);
          } catch (err) {
            if (
              err instanceof AppException &&
              (err.getResponse() as { code?: string }).code ===
                'PLAN_LIMIT_REACHED'
            ) {
              skipped += rows.length - i;
              break;
            }
            throw err;
          }
        }

        const contact = repo.create({
          workspaceId,
          name: row.name?.trim() || null,
          phoneE164: e164,
          email: row.email?.trim() || null,
          tags: row.tags ?? [],
          optedIn: true,
          source: 'csv',
          attributes: row.attributes ?? {},
        });
        await repo.save(contact);
        imported++;
      }
    });

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
