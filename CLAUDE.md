# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

`sm-server` is a NestJS 11 (TypeScript) application bootstrapped from the standard `@nestjs/cli` starter. It currently contains only the default `AppModule` / `AppController` / `AppService` scaffolding — no domain code has been added yet.

Entry point: `src/main.ts` boots `AppModule`, wires Swagger via `setupSwagger()` from [src/config/swagger.config.ts](src/config/swagger.config.ts), and listens on `process.env.PORT ?? 3000`.

OpenAPI / Swagger docs are served at `/api` (UI), `/api/json`, and `/api/yaml`. The `@nestjs/swagger` CLI plugin is enabled in [nest-cli.json](nest-cli.json) so DTO/response types are inferred without manual `@ApiProperty` on every field.

## Commands

Install: `npm install`

Run:
- `npm run start:dev` — watch mode (use this for normal development)
- `npm run start` — one-shot dev start
- `npm run start:debug` — watch mode with `--debug`
- `npm run build` && `npm run start:prod` — production build (outputs to `dist/`) and run

Test:
- `npm test` — **primary test command.** Aliased to `npm run test:e2e`; runs `test/**/*.e2e-spec.ts` against the real app.
- `npm run test:watch` — same suite in watch mode.
- `npm run test:e2e` — explicit form (kept so the e2e suite has a self-describing name).
- Single e2e file: `npx jest --config ./test/jest-e2e.json test/users/create-user.e2e-spec.ts`
- Single test by name: `npx jest --config ./test/jest-e2e.json -t "creates a user"`

There is no separate "unit test" command. If branchy business logic appears later and warrants unit tests, either merge them into the e2e jest config (via `projects`) or add a new `test:unit` script — don't resurrect the inlined `jest` block in `package.json`.

Lint / format: `npm run lint` (eslint --fix) and `npm run format` (prettier).

Typecheck: `npm run typecheck` (`tsc --noEmit` — strict mode is enabled in `tsconfig.json`).

## Nest CLI

Use the Nest CLI to scaffold instead of hand-writing boilerplate. Common commands:

- `nest g resource <name>` — full CRUD: module + controller + service + dto/ + entities/ + spec files.
- `nest g module <name>` — module only.
- `nest g controller <name>` — controller only.
- `nest g service <name>` — service only.
- `nest g class <name>` / `nest g interface <name>` — plain class/interface.

Aliases / other schematics:

| name          | alias       | what it does                            |
|---------------|-------------|-----------------------------------------|
| application   | application | new application workspace               |
| class         | cl          | new class                               |
| configuration | config      | CLI configuration file                  |
| controller    | co          | controller                              |
| decorator     | d           | custom decorator                        |
| filter        | f           | exception filter                        |
| gateway       | ga          | websocket gateway                       |
| guard         | gu          | guard                                   |
| interceptor   | itc         | interceptor                             |
| interface     | itf         | interface                               |
| library       | lib         | library inside a monorepo               |
| middleware    | mi          | middleware                              |
| module        | mo          | module                                  |
| pipe          | pi          | pipe                                    |
| provider      | pr          | provider                                |
| resolver      | r           | GraphQL resolver                        |
| resource      | res         | full CRUD resource (preferred for features) |
| service       | s           | service                                 |
| sub-app       | app         | sub-app inside a monorepo               |

Other commands: `nest new`, `nest build`, `nest start`, `nest info`, `nest add <library>`.

After scaffolding, **always delete the boilerplate `should be defined` `.spec.ts` files** — they test nothing. See the testing section below.

## Testing strategy

Default to **API-level (e2e) tests**. They exercise the real wiring — pipes, filters, guards, serialization, controller→service→repo — so a failure means a real user-facing contract is broken.

Rules:

- **Every feature gets an e2e test** under `test/<feature>.e2e-spec.ts` that covers the public HTTP contract: happy path + key error paths (400 validation, 404 not-found, 401/403 if guarded).
- **No `should be defined` specs.** They test Nest's DI, not your code. Delete them after `nest g resource`.
- **Unit tests only for branchy business logic** — pricing rules, state machines, complex validators, pure functions with multiple paths. Pure CRUD passthroughs do not get unit tests.
- **E2E must hit real seams.** Once the project has a database, e2e tests run against a real (test) database via Testcontainers or an ephemeral instance — never against a mocked repo.
- **Bootstrap parity.** The e2e `Test.createTestingModule(...).createNestApplication()` must apply the same global pipes, filters, and interceptors as production `main.ts`. Extract a shared `applyGlobalConfig(app)` helper so tests and prod stay in sync.

### E2E file layout

```
test/
  helpers/
    create-test-app.ts            shared bootstrap (the ONE place to wire global pipes/filters)
  <feature>/
    <operation>.e2e-spec.ts       one file per endpoint operation
  jest-e2e.json
```

Rules:

- **One file per endpoint operation.** `create-user.e2e-spec.ts` covers everything about POST /users (happy + 400 + 409 + auth scenarios). A single `users.e2e-spec.ts` that covers all 5 CRUD verbs is rejected — it doesn't scale past ~10 endpoints.
- **Every spec uses `createTestApp()`** from `test/helpers/create-test-app.ts`. Never re-instantiate `Test.createTestingModule(...)` in a spec file. When global config changes (pipes, filters, interceptors), the helper changes — specs do not.
- **`beforeAll` / `afterAll` per file.** One bootstrap per file is the right cost/isolation tradeoff for now. (Once a DB exists, add per-test cleanup or transactional rollback inside the spec — not in the helper.)
- **`jest-e2e.json` already recurses.** `testRegex: ".e2e-spec.ts$"` with `rootDir: "."` picks up nested files automatically — no config change needed when adding a new feature folder.

## After making changes

Before reporting any code change as done, run all three and make sure they pass:

1. `npm run lint`
2. `npm run typecheck`
3. `npm test` (and `npm run test:e2e` if you touched anything covered by e2e)

Fix any failures before handing back. The Node version is pinned in `.nvmrc` (run `nvm use` if your shell version drifts).

## Conventions

- Two test configs coexist: unit tests live next to source as `*.spec.ts` with `rootDir: src` (config in `package.json`); e2e tests live in `test/` as `*.e2e-spec.ts` with their own `test/jest-e2e.json`. Don't mix the two.
- `nest-cli.json` sets `deleteOutDir: true`, so `nest build` wipes `dist/` on every build.

## Code style — best practices and scalable structure

Always write code that scales. Do not pile unrelated concerns into one file.

- **One concern per file.** A controller file holds the controller; a service file holds the service; a DTO file holds the DTO. Configuration (e.g. Swagger, CORS, validation pipes) lives under `src/config/`, not in `main.ts`.
- **Feature-first folders.** Group code by feature/domain (e.g. `src/users/`, `src/orders/`), not by technical type (`src/controllers/`, `src/services/`). Each feature folder owns its module, controllers, services, DTOs, and entities.
- **Layer the responsibilities.** Controllers stay thin (routing, validation, serialization). Services hold business logic. Repositories / data-access live separately. Don't call the database from a controller.
- **DTOs over inline shapes.** Use class-based DTOs for request and response bodies under `<feature>/dto/`. They give Swagger types, validation (`class-validator`), and transformation (`class-transformer`) for free.
- **Encapsulate via modules.** Each feature exports a `*.module.ts` that declares its providers and only re-exports what other modules actually need.
- **Configuration via `@nestjs/config` and env vars.** No hard-coded secrets, ports, URLs, or feature flags inside business code.
- **No "god files."** If a file passes ~200 lines or mixes two responsibilities, split it before adding to it.

When in doubt, prefer adding a new small file over extending an existing one.
