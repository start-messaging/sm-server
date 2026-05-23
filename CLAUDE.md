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
- `npm test` — Jest unit tests (`*.spec.ts` under `src/`, config inlined in `package.json`)
- `npm run test:watch` / `npm run test:cov`
- `npm run test:e2e` — uses `test/jest-e2e.json` (`*.e2e-spec.ts` under `test/`)
- Single test file: `npx jest src/path/to/file.spec.ts`
- Single test by name: `npx jest -t "test name"`

Lint / format: `npm run lint` (eslint --fix) and `npm run format` (prettier).

Typecheck: `npm run typecheck` (`tsc --noEmit` — strict mode is enabled in `tsconfig.json`).

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
