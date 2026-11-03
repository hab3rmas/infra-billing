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
| 1.5. Profiles | done |
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
| `packages/shared/src/index.ts` | `export * from './fork-routes'`, `'./schemas/topology'`, `'./schemas/profile'` |
| `apps/backend/prisma/schema/project.prisma` | (also) back-relation `profileProject` |
| `apps/backend/src/prisma/prisma.module.ts` | provides `PrismaBase` and the scoped client under the `PrismaService` token |
| `apps/backend/src/notifications/notifications.module.ts` | `NotificationsService` / `TelegramService` provided via profile-aware subclasses |
| `apps/backend/src/app.module.ts` | (also) `ProfilesCoreModule`, `ProfilesModule` |
| `apps/frontend/src/main.tsx` | `import './lib/profileScope'` (adds the `X-Profile` header to the axios client) |
| `apps/frontend/src/layout/AppLayout.tsx` | `<ProfileSwitcher />` in the sidebar header, `<ProfileBadge />` next to the breadcrumb |
| `apps/frontend/src/layout/nav.ts` | settings item "Profiles" |
| `apps/frontend/src/App.tsx` | route `settings/profiles` |
| `apps/frontend/src/i18n/index.ts` | `profiles` namespace (en, ru) |

Not touched (kept in fork files instead): `routes.ts` (see `fork-routes.ts`),
`controllers-info.ts` (see `FORK_CONTROLLERS_INFO` in `fork-routes.ts`), the global
`RepositoriesModule` (fork repositories are provided by the fork's own modules).

Planned touch points (later stages): `ServicesTable.tsx`, `ServiceDetailModal.tsx`,
`frontend/package.json`, and the topology route / nav item.

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
| `20261105130000_fork_profiles` | `profiles`, `profile_projects`, FK `topology_maps.profile_uuid` → `profiles` |

The only hard dependency on upstream: foreign keys to `services.uuid`, `projects.uuid` and
`provider_accounts.uuid`. If upstream renames or drops those, fix the FKs in a separate migration.

## Behaviour notes

- **Account default project.** `AccountProjectsService` has its own 5-minute timer. It moves a
  service from the default project into its account's project once (`service_auto_projects`), so a
  manual move back is never undone. It does not hook into upstream `SyncService`, so a new service
  waits up to 5 minutes. `POST /account-projects/apply?dryRun=true` previews the one-off move of
  services that already exist.
- **Imported nodes/links** (`source=remnawave`) are hidden, not deleted, on `DELETE`.
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

## Profiles (stage 1.5)

Switcher at the top of the sidebar; `All profiles` is exactly upstream's behaviour.

- **Scope.** The frontend sends `X-Profile: <uuid>`. `ProfileScopeInterceptor` validates it (400 for a
  non-uuid, 404 for an unknown profile) and runs the request inside an `AsyncLocalStorage` scope.
  `X-Profile: all` (or no header) means no scope. API tokens can send the header too; a per-token
  profile binding (`ApiTokenProfile`) is not implemented.
- **Filter.** `PrismaService` is now a Prisma client extension (`profiles/scoped-prisma.ts`) that adds
  the membership `where` to every query of Project, Service, ProviderAccount, Provider, Payment,
  BalanceSnapshot, SyncRun, TopologyMap/Node/Link and RemnawaveIntegration. Update/delete of a foreign
  record gives 404, writing a service into a project outside the profile gives 404.
- **Membership (computed, no new columns upstream).** project → `profile_projects`; service → its
  project; account → default project (`account_default_projects`) in the profile or a service in it;
  payment → service in the profile, or (no service) account in the profile. Pure rules and tests:
  `profiles/profile-scope.ts`, `fork-test/profile-scope.test.mjs`.
- **Shared accounts.** Visible in each profile that uses them; counted only in the home profile (the
  profile of its default project, else where it has most services, ties to the earlier profile).
  Notification runs use home accounts only, so runway and sync-error alerts go out once.
- **Created in a profile.** A project joins the profile; a provider/account created inside gets the
  profile's default project (or its first project) as account default, so it is visible at once.
- **Notifications.** `ProfileAwareNotificationsService` runs the upstream check once per profile
  (plus once for projects outside any profile); `ProfileAwareTelegramService` prefixes `[Profile]` and
  routes to the profile's own chat / topic. The upstream `@Cron` calls the override.
- **Flag.** `FORK_PROFILES=false` in `.env` disables the scope, the interceptor override and the
  switcher (`GET /api/profiles/config`). Default is on. (`.env.example` is upstream's, not edited.)
- **Frontend.** `lib/profileScope.ts` (header, `localStorage`, `?profile=<slug>`; the slug is written
  to the address bar on switch, but in-app navigation drops it, `localStorage` keeps the choice),
  `components/fork/ProfileSwitcher.tsx`, `pages/settings-profiles/`. Switching resets the query cache.

### Repository audit (nested includes)

| Repository method | Includes | Handling |
|---|---|---|
| `providers.listWithAccounts/findWithAccounts/create/update/merge` | `accounts` (+ `_count`) | `accounts` post-filtered to the scope; `_count` is the unfiltered number |
| `providers.findWithServices` | `accounts.services` | accounts and services post-filtered |
| `providerAccounts.findByUuid/listByProvider/create/update` | `provider`, `_count` | counts unfiltered (numbers only, no ids) |
| `projects.*` | `_count.services` | project itself is scoped; count is of that project |
| `services.listFiltered` | `_count.payments` | numbers only |
| `syncRuns.listErrorsSince` | `account.provider._count.accounts` | number only |
| `providerAccounts.deleteUnlessLast` | raw `SELECT … FOR UPDATE` on `providers` | runs on the transaction client, not filtered, reads no data |

Known limitation: `_count` values on a shared account/provider include the other profile's rows (a
number, never an id). Re-check this table after every upstream merge, and run
`apps/backend/fork-test/profile-leak.mjs` (it walks every Swagger GET, so new endpoints are covered).
