# TypeORM Migrations

This directory holds TypeORM migration files for `sm-server`.

## Why migrations (not synchronize)

`DB_SYNCHRONIZE=true` auto-alters the production schema on startup — a single
deploy could silently drop a column or rename a constraint. Use it only in
throwaway local databases. **Production and staging must always use migrations.**

## Quick reference

```bash
# Generate a migration from entity diffs
npm run migration:generate -- src/database/migrations/YourMigrationName

# Create a blank migration file
npm run migration:create -- src/database/migrations/YourMigrationName

# Apply all pending migrations
npm run migration:run

# Revert the last applied migration
npm run migration:revert

# Show applied/pending status
npm run migration:show
```

All commands use `src/database/data-source.ts` (the CLI DataSource) which
reads `.env` via `dotenv` at the project root.

## First-time production setup

1. Set `DB_SYNCHRONIZE=false` (already the default).
2. Run `npm run migration:generate -- src/database/migrations/InitialSchema` on a
   fresh DB to capture the current entity state as the baseline migration.
3. Commit the generated file and run `npm run migration:run` on every environment.
4. From that point on, all schema changes go through `migration:generate` +
   `migration:run` — never `synchronize`.

## Naming convention

`YYYYMMDDHHMMSS-<PascalCase>.ts` — TypeORM's generator adds the timestamp
automatically. Keep names descriptive:

```
1720000000000-InitialSchema.ts
1720100000000-AddWabaAccountsTable.ts
1720200000000-AddEncryptedTokenColumn.ts
```

## Phase 0 note

The WhatsApp entities (`waba_accounts`, `phone_numbers`, `wa_webhook_events`)
are currently created via `DB_SYNCHRONIZE=true` in development. Before the
first production deploy run:

```bash
npm run migration:generate -- src/database/migrations/Phase0WhatsAppEntities
npm run migration:run
```

Then set `DB_SYNCHRONIZE=false` and remove it from the production env.
