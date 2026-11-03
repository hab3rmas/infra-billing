import { NotFoundException } from '@nestjs/common';
import type { PrismaClient } from '@generated/prisma/client';
import { currentProfileScope, type ProfileScope } from './profile-scope';

// Prisma client extension that narrows every query to the active profile scope (AsyncLocalStorage,
// set per request by ProfileScopeInterceptor or per run by the notifications). With no scope the
// client behaves exactly like upstream's.
//
// Nested include/select are not filtered by `where`, so results are post-filtered for the list
// relations upstream repositories include (see FORK.md, "Repository audit").

type Where = Record<string, unknown>;

/** Extra `where` for a model in this scope; null = the model is not scoped. */
export function scopeWhere(model: string, s: ProfileScope): Where | null {
  const projects = { in: s.projectUuids };
  const accounts = { in: s.accountUuids };
  switch (model) {
    case 'Project':
      return { uuid: projects };
    case 'Service':
      return { projectUuid: projects };
    case 'ProviderAccount':
      return { uuid: accounts };
    case 'Provider':
      return { accounts: { some: { uuid: accounts } } };
    case 'Payment':
      return {
        OR: [{ service: { projectUuid: projects } }, { serviceUuid: null, accountUuid: accounts }],
      };
    case 'BalanceSnapshot':
    case 'SyncRun':
      return { accountUuid: accounts };
    case 'TopologyMap':
      return { profileUuid: s.profileUuid };
    case 'RemnawaveIntegration':
      return { map: { profileUuid: s.profileUuid } };
    case 'TopologyNode':
    case 'TopologyLink':
      return { map: { profileUuid: s.profileUuid } };
    default:
      return null;
  }
}

const and = (where: Where | undefined, extra: Where): Where => {
  if (!where) return extra;
  const existing = Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : [];
  return { ...where, AND: [...existing, extra] };
};

const WHERE_OPS = new Set([
  'findMany',
  'findFirst',
  'findFirstOrThrow',
  'findUnique',
  'findUniqueOrThrow',
  'count',
  'aggregate',
  'groupBy',
  'updateMany',
  'deleteMany',
  'update',
  'delete',
]);
const GUARDED_OPS = new Set(['update', 'delete']);

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

type Row = Record<string, unknown>;
// Plain objects only: Decimal, Date, Buffer… must pass through as they are.
const isRow = (v: unknown): v is Row => {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
};

/** Drop rows of nested list relations that fall outside the scope (recursive). */
export function postFilter(value: unknown, s: ProfileScope): unknown {
  if (Array.isArray(value)) return value.map((v) => postFilter(v, s));
  if (!isRow(value)) return value;
  const projects = new Set(s.projectUuids);
  const accounts = new Set(s.accountUuids);
  const out: Row = {};
  for (const [k, v] of Object.entries(value)) {
    if (Array.isArray(v) && v.every(isRow)) {
      let rows = v as Row[];
      if (k === 'accounts')
        rows = rows.filter((r) => typeof r.uuid !== 'string' || accounts.has(r.uuid));
      else if (k === 'services') {
        rows = rows.filter((r) => typeof r.projectUuid !== 'string' || projects.has(r.projectUuid));
      } else if (k === 'payments' || k === 'snapshots' || k === 'syncRuns') {
        rows = rows.filter((r) => typeof r.accountUuid !== 'string' || accounts.has(r.accountUuid));
      }
      out[k] = rows.map((r) => postFilter(r, s));
    } else {
      out[k] = isRow(v) ? postFilter(v, s) : v;
    }
  }
  return out;
}

export function createScopedPrisma<T extends PrismaClient>(base: T): T {
  const extended = base.$extends({
    query: {
      $allModels: {
        async $allOperations({
          model,
          operation,
          args,
          query,
        }: {
          model: string;
          operation: string;
          args: Row;
          query: (a: Row) => Promise<unknown>;
        }) {
          const scope = currentProfileScope();
          if (!scope) return query(args);

          const extra = scopeWhere(model, scope);
          const delegate = (base as unknown as Record<string, Record<string, (a: Row) => unknown>>)[
            lowerFirst(model)
          ];

          if (extra && WHERE_OPS.has(operation)) {
            const where = and(args.where as Where | undefined, extra);
            if (GUARDED_OPS.has(operation)) {
              // A foreign record must look absent, not raise Prisma's P2025 (a 500).
              const found = await delegate.findFirst({ where, select: {} as Row });
              if (!found) throw new NotFoundException(`${model} not found`);
            }
            args = { ...args, where };
          }

          // Writes may only target projects of the active profile.
          if (
            model === 'Service' &&
            (operation === 'create' || operation === 'update') &&
            isRow(args.data) &&
            typeof args.data.projectUuid === 'string' &&
            !scope.projectUuids.includes(args.data.projectUuid)
          ) {
            throw new NotFoundException('Project not found');
          }

          const result = await query(args);
          if (!extra) return result;
          if (operation === 'create') await afterCreate(base, model, result, scope);
          return postFilter(result, scope);
        },
      },
    },
  });
  return extended as unknown as T;
}

/** New entities created inside a profile must be visible in it straight away. */
async function afterCreate(base: PrismaClient, model: string, result: unknown, s: ProfileScope) {
  if (!s.profileUuid || !isRow(result)) return;
  if (model === 'Project' && typeof result.uuid === 'string') {
    await base.profileProject.upsert({
      where: { projectUuid: result.uuid },
      update: {},
      create: { projectUuid: result.uuid, profileUuid: s.profileUuid },
    });
    s.projectUuids.push(result.uuid);
    return;
  }
  const accountUuids: string[] = [];
  if (model === 'ProviderAccount' && typeof result.uuid === 'string')
    accountUuids.push(result.uuid);
  if (model === 'Provider' && Array.isArray(result.accounts)) {
    for (const a of result.accounts)
      if (isRow(a) && typeof a.uuid === 'string') accountUuids.push(a.uuid);
  }
  if (accountUuids.length === 0) return;
  // An empty account has no services, so tie it to the profile through its default project.
  const profile = await base.profile.findUnique({ where: { uuid: s.profileUuid } });
  const projectUuid = profile?.defaultProjectUuid ?? s.projectUuids[0];
  if (!projectUuid) return;
  for (const accountUuid of accountUuids) {
    await base.accountDefaultProject.upsert({
      where: { accountUuid },
      update: {},
      create: { accountUuid, projectUuid },
    });
    s.accountUuids.push(accountUuid);
    s.homeAccountUuids.push(accountUuid);
  }
}
