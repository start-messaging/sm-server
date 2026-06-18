import 'reflect-metadata';
import { config as loadEnv } from 'dotenv';
import * as argon2 from 'argon2';
import dataSource from '../data-source';
import { PlatformStaff } from '../../admin/entities/platform-staff.entity';
import { PlatformRole } from '../../admin/enums/platform-role.enum';
import { Wallet } from '../../wallets/entities/wallet.entity';
import { Workspace } from '../../workspaces/entities/workspace.entity';
import { seedReferenceData } from './reference.seed';

loadEnv();

/** Idempotently create the first SUPER_ADMIN from env. Safe to re-run. */
async function seedBootstrapStaff(): Promise<void> {
  const email = process.env.ADMIN_BOOTSTRAP_EMAIL;
  const password = process.env.ADMIN_BOOTSTRAP_PASSWORD;
  if (!email || !password) {
    throw new Error(
      'ADMIN_BOOTSTRAP_EMAIL and ADMIN_BOOTSTRAP_PASSWORD must be set',
    );
  }

  const repo = dataSource.getRepository(PlatformStaff);
  const existing = await repo.findOne({ where: { email } });
  if (existing) {
    console.log(`[seed] bootstrap staff already exists: ${email}`);
    return;
  }

  const staff = repo.create({
    email,
    passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
    fullName: 'Platform Admin',
    platformRole: PlatformRole.SUPER_ADMIN,
  });
  await repo.save(staff);
  console.log(`[seed] created bootstrap SUPER_ADMIN: ${email}`);
}

/**
 * Billing Core arrived after some workspaces already existed (the pre-reset
 * data). Every workspace must have exactly one wallet, currency-locked to it.
 * New workspaces get theirs inside the create transaction; this backfills the
 * stragglers. Idempotent: only creates wallets for workspaces missing one.
 */
async function backfillWallets(): Promise<void> {
  const workspaces = dataSource.getRepository(Workspace);
  const wallets = dataSource.getRepository(Wallet);

  const orphaned: { id: string; default_currency: string }[] = await workspaces
    .createQueryBuilder('w')
    .select(['w.id AS id', 'w.default_currency AS default_currency'])
    .leftJoin(Wallet, 'wal', 'wal.workspace_id = w.id')
    .where('wal.id IS NULL')
    .getRawMany();

  if (orphaned.length === 0) {
    console.log('[seed] all workspaces already have a wallet');
    return;
  }
  await wallets.save(
    orphaned.map((w) =>
      wallets.create({
        workspaceId: w.id,
        currency: w.default_currency,
        balanceMicros: '0',
        heldMicros: '0',
      }),
    ),
  );
  console.log(`[seed] backfilled ${orphaned.length} wallet(s)`);
}

async function run(): Promise<void> {
  await dataSource.initialize();
  try {
    await seedReferenceData();
    await seedBootstrapStaff();
    await backfillWallets();
  } finally {
    await dataSource.destroy();
  }
}

// Only execute when invoked directly (`npm run db:seed`). A transitive import
// (e.g. from a test picking up data-source helpers) must never seed a database.
if (require.main === module) {
  run().catch((err) => {
    console.error('[seed] failed:', err);
    process.exit(1);
  });
}
