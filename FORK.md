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
| 2. Topology page | done |
| 3. Tabby | done |
| 4. Remnawave | done |
| 5. Polish | done |

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
| `apps/backend/src/app.module.ts` | (also) `ProfilesCoreModule`, `ProfilesModule`, `RemnawaveModule` |
| `apps/backend/src/mcp/mcp.operations.ts` | two read-only operations `topology.maps`, `topology.get` at the end of the list, plus the `FORK_API_PATH` import |
| `package-lock.json` | follows the `apps/frontend/package.json` dependencies (regenerate with `npm install`, do not merge by hand) |
| `apps/frontend/src/main.tsx` | `import './lib/profileScope'` (adds the `X-Profile` header to the axios client) |
| `apps/frontend/src/layout/AppLayout.tsx` | `<ProfileSwitcher />` in the sidebar header, `<ProfileBadge />` next to the breadcrumb |
| `apps/frontend/src/layout/nav.ts` | items "Topology" (infrastructure) and settings "Profiles", "Topology settings" |
| `apps/frontend/src/App.tsx` | routes `settings/profiles`, `settings/topology`, lazy `topology` |
| `apps/frontend/src/i18n/index.ts` | `profiles`, `topology`, `topologySettings` namespaces (en, ru) |
| `apps/frontend/package.json` | `@xyflow/react`, `elkjs`, `html-to-image` (the lockfile changes with it) |
| `apps/frontend/src/pages/services/ServicesTable.tsx` | one `<OpenInTabbyButton serviceUuid compact />` in the next-billing cell + import |
| `apps/frontend/src/pages/services/ServiceDetailModal.tsx` | one `<OpenInTabbyButton serviceUuid />` in the footer + import |

Not touched (kept in fork files instead): `routes.ts` (see `fork-routes.ts`),
`controllers-info.ts` (see `FORK_CONTROLLERS_INFO` in `fork-routes.ts`), the global
`RepositoriesModule` (fork repositories are provided by the fork's own modules).


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

## Topology page (stage 2)

- Files: `pages/topology/` (canvas, nodes, edge, panels, `roles.ts`, `edgeStyles.ts`, `graph.ts`,
  `layout.ts`, `topology.css`), `pages/settings-topology/`, `api/topology.ts`, `i18n/locales/topology.ts`.
- React Flow 12 for the canvas, elk (`layered`, lazy `import()`) for the automatic layout; both load
  only with the lazy topology route. Edge dots are SVG `<animateMotion>` (no animation library); off
  per link, globally (`TopologySettings.animateEdges`) and for `prefers-reduced-motion`.
- Layout: nodes without saved coordinates get an elk layout once and it is saved; manual positions
  always win. Children of a group are stacked inside it (positions relative to the group).
- A server without a billing service (panel, bot…) is stored as `kind=external` with a server role and
  drawn as a card; only client/internet/dns/cdn/waf/storage/backup are drawn as pills (`PILL_ROLES`).
- Mobile (< 768 px): view only (pan, zoom, tap opens the sheet); no dragging, linking or editing.
- Not done: a "one server with several roles" wizard (create a container node by hand and move the
  nodes into it).
- Checks: `scripts/fork-capture-topology.mjs` (screenshots, light/dark), `scripts/fork-e2e-topology.mjs`
  (drag saves, hover dims, add node), `apps/backend/fork-test/seed-topology-demo.mjs` (the owner's VPN
  scheme and a website scheme through the API).

## Tabby (stage 3)

- `lib/tabby.ts` builds only `tabby://profile?profileName=` and `tabby://quickConnect?providerId=ssh&query=user@host:port`
  (IPv6 in brackets). `run` and every other command are never generated (CVE-2026-45035; Tabby >= 1.0.233).
  Verified against Tabby's `app/lib/cli.ts` (`profile [profileName]`, `quickConnect <providerId> <query>`)
  and `tabby-ssh` (`options.host/port/user`).
- Buttons: node card, node sheet (SSH block with a live preview of the command), services table and
  service modal (`GET /topology/service-targets`: node host, else the service's first IP).
  If the tab keeps focus 1.5 s after the click, a toast offers to copy the ssh command.
- Export: `GET /topology/tabby-profiles` (YAML, ids `ssh:custom:<slug>:<node uuid>`, no secrets),
  dialog on the topology page (download / copy), and `POST /topology/tabby-profiles/adopt` (with confirm)
  to store the exported names as `tabbyProfile` so the profile deep link works at once.
- Not done: command-palette entries "SSH: <name>" (would mean rewriting `CommandPalette.tsx`); a
  "default mode" setting (a node uses its profile when it has one, quickConnect otherwise).
- Tests: `fork-test/tabby.test.mjs` (the frontend module is bundled with esbuild inside the test),
  `scripts/fork-e2e-tabby.mjs` (browser).

## Remnawave (stage 4)

- Files: `src/remnawave/` (`remnawave.importer.ts` pure conversion, `remnawave.plan.ts` pure diff,
  `remnawave.match.ts`, `remnawave.parse.ts`, `remnawave.url.ts`, `remnawave.client.ts`,
  `remnawave.service.ts`, controller, module), `src/repositories/remnawave/`, and on the frontend
  `api/remnawave.ts`, `pages/settings-topology/RemnawaveSection.tsx`.
- API shapes (`/api/nodes`, `/api/config-profiles[/{uuid}[/computed-config]]`, `/api/hosts`, the
  `{ response: … }` wrapper) follow the task text; they were NOT checked against a live panel, only
  against a mock with the owner's scheme. Parsers are tolerant (unknown fields ignored, junk skipped
  with a warning). If a real response differs, adjust `remnawave.parse.ts` and re-run
  `fork-test/remnawave-importer.test.mjs`.
- Importer: nodes (roles from the outbound graph), `vless`/`vmess`/`trojan`/`shadowsocks`/`hysteria*`
  outbounds into links (bridge / chain), `wireguard` to `engage.cloudflareclient.com` or a `warp` tag
  into a shared WARP node, `freedom` into Internet (exit) or RU sites (direct, on bridges and for RU
  geo rules), `sendThrough` / `listen` IPs into a group with A (in) and B (out), routing rules into
  `route` (one link per `vlessRoute`; routeless geo rules fold into the routed links), hosts into
  Clients to node links, panel and subscription page nodes with dashed management links.
- Sync keeps hand-made content: manual links are never touched; hidden imported links stay hidden;
  owner edits are flagged in `meta` (`roleOverridden`, `labelOverridden`, `addressesOverridden`,
  `serviceOverridden`, link `overridden[]`) and win over the importer; positions are never changed.
  Links gone from the panel are removed, nodes gone from the panel are hidden. Keys include the
  integration uuid, so two panels on one map do not overwrite each other. A node already bound on the
  map (unique per map) is added without the binding and a warning is returned.
- Billing service match: by IP (the node address, or its DNS A records, 3 s timeout), then by name;
  the map's project first; ambiguity gives a warning and no link.
- Security: the base URL must be `https://` (`http://` only for localhost and private addresses),
  no redirects are followed, the token and headers are AES-GCM encrypted, never returned by the API
  (`tokenSet`/`extraHeadersSet` only), never logged, never in `lastSnapshot` or error messages;
  reveal is `POST …/credentials/reveal`, session only. Only secret-free messages are stored as
  `lastSyncError`.
- Autosync: a 5-minute tick runs every enabled `autoSync` integration, one after another, once the
  `Settings.syncIntervalHours` interval has passed. A failing panel does not stop the others.
- Not done: grouping the panel and a node into one container when they share a server.
- Tests: `fork-test/remnawave-importer.test.mjs`, `remnawave-plan.test.mjs` (fixtures:
  `remnawave-fixtures.mjs`), `remnawave-e2e.mjs` (API against a running panel and a mock Remnawave),
  `scripts/fork-e2e-remnawave.mjs` (browser).

## Polish (stage 5)

- Node search (a combobox over the canvas, centres and highlights the node), PNG / SVG export of the
  whole graph (`html-to-image`, theme-aware background), mobile view (< 768 px: pan/zoom and tap to
  open the sheet; legend and project card start collapsed).
- MCP: `topology.maps` and `topology.get` (read-only, fit in one insertion in `mcp.operations.ts`;
  verified with a read-only API token by `fork-test/mcp-topology.mjs`). No fork write operation is
  exposed over MCP.
- `fork-test/i18n-keys.test.mjs` checks that en and ru have the same keys, the right plural forms and
  that every key used by the fork UI exists.

## Trial merge of upstream (stage 5 report)

`git fetch upstream && git merge upstream/main` on `fork/topology` (upstream at 0.54.0, the same
commit the fork branched from): "Already up to date", so there was nothing to conflict. The files of
upstream the fork modifies are exactly the 17 listed under "Touch points" (checked with
`git diff --name-status upstream/main HEAD | grep '^M'`). Re-run that command after every merge: a file
that shows up there and is not in the table is a bug in the fork. Real conflicts can only be in those
files, always as small insertions marked `fork:topology`.

After every merge also run: the unit tests (`node --test apps/backend/fork-test/*.test.mjs`), then
`profile-leak.mjs` against a panel with `DOCS=true` (it walks every GET of the new Swagger).

## Docker verification (done on the author's Windows machine)

- Build the image from a clean export, not from the working copy: with `core.autocrlf=true` the
  checked-out `docker-entrypoint.sh` has CRLF line endings and the container dies with
  `set: illegal option -`. This is a checkout artifact, the blob in git is LF:
  `git -c core.autocrlf=false archive HEAD | tar -x -C <dir>` then `docker build <dir>`.
- Verified in containers (images built from clean `git archive` exports, upstream 0.54.0 and the fork):
  1. the fork image on an EMPTY database: all 30 migrations apply, "Migrations applied.", health is ok;
  2. the upstream image on a fresh database, an owner and two services created, then the fork image on
     the SAME database: the three fork migrations apply (`fork_topology_init`,
     `fork_remnawave_integration`, `fork_profiles`), both services are still there, and a topology
     map, a profile and a profile-scoped request work.
- To repeat after merging upstream: build both images from exports, start the upstream one on a fresh
  database, create a couple of services, stop it, start the fork on the same database and check the
  log says "Migrations applied." and the services are still there.
