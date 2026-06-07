import 'reflect-metadata';
import { config as loadEnv } from 'dotenv';
import * as argon2 from 'argon2';
import dataSource from '../data-source';
import { PlatformStaff } from '../../admin/entities/platform-staff.entity';
import { PlatformRole } from '../../admin/enums/platform-role.enum';

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

async function run(): Promise<void> {
  await dataSource.initialize();
  try {
    await seedBootstrapStaff();
  } finally {
    await dataSource.destroy();
  }
}

run().catch((err) => {
  console.error('[seed] failed:', err);
  process.exit(1);
});
