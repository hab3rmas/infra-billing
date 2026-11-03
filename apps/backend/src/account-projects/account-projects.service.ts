import { Injectable, Logger, NotFoundException, type OnModuleInit } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import {
  type AccountProject,
  type ApplyAccountProjectsResult,
  DEFAULT_PROJECT_UUID,
} from '@infra/shared';
import { AccountProjectsRepository } from '@repositories/account-projects/account-projects.repository';
import { ProjectsRepository } from '@repositories/projects/projects.repository';
import { ProviderAccountsRepository } from '@repositories/provider-accounts/provider-accounts.repository';
import { pickServicesToMove } from '../topology/topology.utils';

const RECONCILE_INTERVAL_NAME = 'fork-account-projects';
// Upstream's sync cannot be hooked without editing it, so poll often: the query is a no-op until an
// account has a default project.
const RECONCILE_INTERVAL_MS = 60_000;

// Upstream's SyncService drops every new service into the default project (it can't know the
// project). This reconciler runs on its own timer and moves them to their account's project, once
// per service, so the upstream sync stays untouched and a later manual move always wins.
@Injectable()
export class AccountProjectsService implements OnModuleInit {
  private readonly logger = new Logger(AccountProjectsService.name);

  constructor(
    private readonly repo: AccountProjectsRepository,
    private readonly projects: ProjectsRepository,
    private readonly accounts: ProviderAccountsRepository,
    private readonly scheduler: SchedulerRegistry,
  ) {}

  onModuleInit(): void {
    const timer = setInterval(() => void this.reconcileSafe(), RECONCILE_INTERVAL_MS);
    timer.unref();
    this.scheduler.addInterval(RECONCILE_INTERVAL_NAME, timer);
  }

  async list(): Promise<AccountProject[]> {
    const rows = await this.repo.listAccounts();
    return rows.map((a) => ({
      accountUuid: a.uuid,
      providerName: a.provider.name,
      accountLabel: a.label,
      projectUuid: a.defaultProject?.projectUuid ?? null,
    }));
  }

  async set(accountUuid: string, projectUuid: string | null): Promise<AccountProject> {
    if (!(await this.accounts.findByUuid(accountUuid))) {
      throw new NotFoundException('Account not found');
    }
    if (projectUuid) {
      if (!(await this.projects.exists(projectUuid))) {
        throw new NotFoundException('Project not found');
      }
      await this.repo.upsert(accountUuid, projectUuid);
    } else {
      await this.repo.remove(accountUuid);
    }
    const item = (await this.list()).find((a) => a.accountUuid === accountUuid);
    return item!;
  }

  /**
   * One-off pass over services that already sit in the default project. Unlike the timer it
   * ignores the mapping's creation time. `dryRun` only reports what would move.
   */
  async apply(dryRun: boolean): Promise<ApplyAccountProjectsResult> {
    const moves = await this.plan(true);
    if (!dryRun) await this.repo.applyMoves(moves);
    return { dryRun, moved: moves.length, services: moves };
  }

  /** Timer entry point: the sync-created services of mapped accounts. Errors never escape. */
  private async reconcileSafe(): Promise<void> {
    try {
      const moves = await this.plan(false);
      await this.repo.applyMoves(moves);
      if (moves.length > 0) {
        this.logger.log(`Moved ${moves.length} new service(s) to account projects`);
      }
    } catch (e) {
      this.logger.error(
        'Account project reconcile failed',
        e instanceof Error ? e.stack : String(e),
      );
    }
  }

  private async plan(ignoreCreatedAt: boolean) {
    const mappings = await this.repo.listMappings();
    if (mappings.length === 0) return [];
    const services = await this.repo.listUnplaced(
      DEFAULT_PROJECT_UUID,
      mappings.map((m) => m.accountUuid),
    );
    const placed = await this.repo.listPlaced(services.map((s) => s.uuid));
    const picked = pickServicesToMove(services, mappings, placed, DEFAULT_PROJECT_UUID, {
      ignoreCreatedAt,
    });
    const names = new Map(services.map((s) => [s.uuid, s.name]));
    return picked.map((p) => ({ ...p, serviceName: names.get(p.serviceUuid) ?? '' }));
  }
}
