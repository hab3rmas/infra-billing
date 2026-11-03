# Fork notes: topology, Remnawave, Tabby, profiles

This fork of [mishkatik/infra-billing](https://github.com/mishkatik/infra-billing) adds, on top of
upstream:

- a **Topology** page (interactive server graph) — stage 2;
- **Remnawave** import into topology maps — stage 4;
- **Tabby** deep links and profile export — stage 3;
- **Profiles** (workspaces) — stage 1.5;
- a **default project per provider account** with a reconciler — stage 1 (done).

Work lives on `fork/topology`; `main` mirrors upstream. Task text: `FORK_TOPOLOGY (1).md`.

## Status

| Stage | State |
|---|---|
| 1. Skeleton and data (models, migrations, topology + account-projects modules) | done |
| 1.5. Profiles | not started |
| 2. Topology page | not started |
| 3. Tabby | not started |
| 4. Remnawave | not started |
| 5. Polish | not started |

## Touch points in upstream files

Every insertion is marked `fork:topology` and sits at the end of its list.

| File | What was inserted |
|---|---|
| `apps/backend/src/app.module.ts` | imports and registers `TopologyModule`, `AccountProjectsModule` |
| `apps/backend/prisma/schema/service.prisma` | back-relations `topologyNodes`, `autoProject` |
| `apps/backend/prisma/schema/project.prisma` | back-relations `topologyMaps`, `accountDefaults` |
| `apps/backend/prisma/schema/provider-account.prisma` | back-relation `defaultProject` |
| `packages/shared/src/index.ts` | `export * from './fork-routes'`, `'./schemas/topology'` |

Not touched (kept in fork files instead): `routes.ts` (see `fork-routes.ts`),
`controllers-info.ts` (see `FORK_CONTROLLERS_INFO` in `fork-routes.ts`), the global
`RepositoriesModule` (fork repositories are provided by the fork's own modules).

Planned touch points (later stages): `App.tsx`, `layout/nav.ts`, `i18n/index.ts`,
`ServicesTable.tsx`, `ServiceDetailModal.tsx`, `frontend/package.json`, `prisma.module.ts`,
`notifications.module.ts`, `main.tsx`, `SidebarParts.tsx`.

## New files

- Prisma: `prisma/schema/topology.prisma`, `remnawave.prisma`, `account-project.prisma`
- Backend: `src/topology/`, `src/account-projects/`, `src/repositories/topology/`,
  `src/repositories/account-projects/`
- Shared: `src/fork-routes.ts`, `src/schemas/topology.ts`
- Tests: `apps/backend/fork-test/` (`node --test apps/backend/fork-test/*.test.mjs` after
  `npm run build`; `smoke-stage1.mjs` is an API smoke script against a running panel on a fresh DB)

## Migrations

All additive: `CREATE TABLE` plus foreign keys from fork tables to upstream tables. Nothing in
upstream tables is altered.

| Migration | Content |
|---|---|
| `20261105120000_fork_topology_init` | `topology_maps/nodes/links/settings`, `account_default_projects`, `service_auto_projects` |
| `20261105120100_fork_remnawave_integration` | `remnawave_integrations` |

The only hard dependency on upstream: foreign keys to `services.uuid`, `projects.uuid` and
`provider_accounts.uuid`. If upstream renames or drops those, fix the FKs in a separate migration.

## Behaviour notes

- **Account default project.** `AccountProjectsService` has its own 5-minute timer. It moves a
  service from the default project into its account's project once (`service_auto_projects`), so a
  manual move back is never undone. It does not hook into upstream `SyncService`, so a new service
  waits up to 5 minutes. `POST /account-projects/apply?dryRun=true` previews the one-off move of
  services that already exist.
- **Imported nodes/links** (`source=remnawave`) are hidden, not deleted, on `DELETE`.
- `topology_maps.profile_uuid` is a plain column for now; the FK to `profiles` arrives with stage 1.5.
- The `tabby-profiles` endpoint and the MCP `topology_get` tool belong to stages 3 and 5.

## Updating from upstream

```bash
git remote add upstream https://github.com/mishkatik/infra-billing   # once
git fetch upstream
git checkout main && git merge --ff-only upstream/main && git push
git checkout fork/topology && git merge main      # merge, not rebase
# conflicts can only be in the touch-point files above: search for `fork:topology`
npm ci && npm run prisma:generate && npm run typecheck && npm run build
docker compose build && docker compose up -d      # upstream and fork migrations apply on start
```

## Local verification notes

- `task` is not installed on the author's Windows box; the equivalent npm scripts are used
  (`npm run check`, `npm run typecheck`, `npm run build`).
- Biome reports upstream files as unformatted on a checkout with `core.autocrlf=true` (CRLF). Only
  run `biome check --write` on fork files, never on whole upstream directories.
