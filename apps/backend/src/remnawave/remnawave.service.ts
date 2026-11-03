import { promises as dns } from 'node:dns';
import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  type OnModuleInit,
} from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import type {
  RemnawaveIntegration as IntegrationDto,
  RemnawaveReveal,
  RemnawaveSyncSummary,
  RemnawaveTestResult,
} from '@infra/shared';
import { dateToIso } from '@common/serialize';
import { RemnawaveRepository } from '@repositories/remnawave/remnawave.repository';
import { SettingsRepository } from '@repositories/settings/settings.repository';
import { TopologyMapsRepository } from '@repositories/topology/topology-maps.repository';
import { TopologyServicesRepository } from '@repositories/topology/topology-services.repository';
import { CryptoService } from '../crypto/crypto.service';
import { extractServiceIps } from '../topology/topology.utils';
import { CreateRemnawaveIntegrationDto, UpdateRemnawaveIntegrationDto } from './dto/remnawave.dto';
import { RemnawaveClient, RemnawaveError } from './remnawave.client';
import { buildTopologyFromRemnawave } from './remnawave.importer';
import { type MatchService, matchService } from './remnawave.match';
import { planImport } from './remnawave.plan';
import { checkPanelUrl } from './remnawave.url';

const TICK_NAME = 'fork-remnawave-sync';
const TICK_MS = 5 * 60_000;
const DEFAULT_SYNC_HOURS = 6;
const DNS_TIMEOUT_MS = 3_000;

type Row = NonNullable<Awaited<ReturnType<RemnawaveRepository['findByUuid']>>>;
type Json = Record<string, unknown>;

const asJson = (v: unknown): Json =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : {};

@Injectable()
export class RemnawaveService implements OnModuleInit {
  private readonly logger = new Logger(RemnawaveService.name);
  private lastAutoRun = Date.now();
  private busy = new Set<string>();

  constructor(
    private readonly repo: RemnawaveRepository,
    private readonly maps: TopologyMapsRepository,
    private readonly services: TopologyServicesRepository,
    private readonly settings: SettingsRepository,
    private readonly crypto: CryptoService,
    private readonly scheduler: SchedulerRegistry,
  ) {}

  /**
   * Autosync follows the providers' interval (Settings.syncIntervalHours). A light tick checks
   * whether it is due, so a changed interval applies without a restart.
   */
  onModuleInit(): void {
    const timer = setInterval(() => void this.autoTick(), TICK_MS);
    timer.unref();
    this.scheduler.addInterval(TICK_NAME, timer);
  }

  private async autoTick(): Promise<void> {
    try {
      const hours = (await this.settings.find())?.syncIntervalHours ?? DEFAULT_SYNC_HOURS;
      if (Date.now() - this.lastAutoRun < hours * 3_600_000) return;
      this.lastAutoRun = Date.now();
      await this.syncAllAuto();
    } catch (e) {
      this.logger.error('Remnawave autosync tick failed', e instanceof Error ? e.stack : String(e));
    }
  }

  /** One after another; a failing panel does not stop the rest. */
  async syncAllAuto(): Promise<void> {
    for (const i of await this.repo.listAutoSync()) {
      try {
        await this.sync(i.uuid);
      } catch (e) {
        this.logger.warn(`Remnawave "${i.name}" sync failed: ${(e as Error).message}`);
      }
    }
  }

  // ---- CRUD ---------------------------------------------------------------------------------

  async list(): Promise<IntegrationDto[]> {
    return (await this.repo.list()).map(map);
  }

  async create(dto: CreateRemnawaveIntegrationDto): Promise<IntegrationDto> {
    this.assertUrl(dto.baseUrl);
    await this.ensureMap(dto.mapUuid);
    const row = await this.repo.create({
      name: dto.name,
      mapUuid: dto.mapUuid,
      baseUrl: dto.baseUrl.replace(/\/+$/, ''),
      tokenEnc: this.crypto.encrypt(dto.token),
      extraHeadersEnc: dto.extraHeaders
        ? this.crypto.encrypt(JSON.stringify(dto.extraHeaders))
        : null,
      subscriptionUrl: dto.subscriptionUrl ?? null,
      panelServiceUuid: dto.panelServiceUuid ?? null,
      subServiceUuid: dto.subServiceUuid ?? null,
      enabled: dto.enabled ?? true,
      autoSync: dto.autoSync ?? true,
    });
    return map(row);
  }

  async update(uuid: string, dto: UpdateRemnawaveIntegrationDto): Promise<IntegrationDto> {
    await this.get(uuid);
    if (dto.baseUrl) this.assertUrl(dto.baseUrl);
    if (dto.mapUuid) await this.ensureMap(dto.mapUuid);
    const data: Record<string, unknown> = {};
    for (const k of [
      'name',
      'mapUuid',
      'subscriptionUrl',
      'panelServiceUuid',
      'subServiceUuid',
      'enabled',
      'autoSync',
    ] as const) {
      if (dto[k] !== undefined) data[k] = dto[k];
    }
    if (dto.baseUrl) data.baseUrl = dto.baseUrl.replace(/\/+$/, '');
    // Token: "" keeps, null deletes. Headers: undefined keeps, null deletes.
    if (dto.token === null) data.tokenEnc = null;
    else if (dto.token) data.tokenEnc = this.crypto.encrypt(dto.token);
    if (dto.extraHeaders === null) data.extraHeadersEnc = null;
    else if (dto.extraHeaders) {
      data.extraHeadersEnc = this.crypto.encrypt(JSON.stringify(dto.extraHeaders));
    }
    return map(await this.repo.update(uuid, data));
  }

  async remove(uuid: string, purge: boolean): Promise<void> {
    const row = await this.get(uuid);
    await this.repo.remove(uuid, row.mapUuid, purge);
  }

  reveal(row: Row): RemnawaveReveal {
    return {
      token: row.tokenEnc ? this.crypto.decrypt(row.tokenEnc) : null,
      extraHeaders: row.extraHeadersEnc
        ? (JSON.parse(this.crypto.decrypt(row.extraHeadersEnc)) as Record<string, string>)
        : null,
    };
  }

  async revealByUuid(uuid: string): Promise<RemnawaveReveal> {
    return this.reveal(await this.get(uuid));
  }

  // ---- test and sync ------------------------------------------------------------------------

  async test(uuid: string): Promise<RemnawaveTestResult> {
    try {
      const { version, nodes } = await this.client(await this.get(uuid)).test();
      return { ok: true, version, nodes, error: null };
    } catch (e) {
      if (!(e instanceof RemnawaveError)) throw e;
      return { ok: false, version: null, nodes: 0, error: e.message };
    }
  }

  async sync(uuid: string): Promise<RemnawaveSyncSummary> {
    const row = await this.get(uuid);
    if (this.busy.has(uuid)) throw new BadRequestException('A sync of this integration is running');
    this.busy.add(uuid);
    try {
      const client = this.client(row);
      const snapshot = await client.snapshot({
        integrationUuid: row.uuid,
        panelUrl: row.baseUrl,
        subscriptionUrl: row.subscriptionUrl,
        panelServiceUuid: row.panelServiceUuid,
        subServiceUuid: row.subServiceUuid,
      });
      const imported = buildTopologyFromRemnawave(snapshot);
      const warnings = [...client.warnings, ...imported.warnings];

      const [state, map] = await Promise.all([
        this.repo.mapState(row.mapUuid),
        this.maps.findWithCounts(row.mapUuid),
      ]);
      const serviceMatches = await this.matchServices(
        imported.nodes,
        map?.projectUuid ?? null,
        warnings,
      );
      const plan = planImport({
        integrationUuid: row.uuid,
        existingNodes: state.nodes.map((n) => ({ ...n, meta: asJson(n.meta) })),
        existingLinks: state.links.map((l) => ({ ...l, meta: asJson(l.meta) })),
        imported,
        serviceMatches,
      });
      warnings.push(...plan.warnings);
      const counts = await this.repo.applyPlan(row.mapUuid, plan);
      // Trimmed and secret-free: enough to debug a surprising import.
      await this.repo.markSynced(uuid, {
        nodes: snapshot.nodes.map((n) => ({
          name: n.name,
          address: n.address,
          online: n.isConnected,
        })),
        profiles: snapshot.profiles.map((p) => p.name),
        hosts: snapshot.hosts.length,
        counts,
        warnings: warnings.slice(0, 50),
      });
      return { ...counts, warnings };
    } catch (e) {
      // Only our own, secret-free messages are stored and shown; anything else (a database error,
      // a bug) goes to the log, not into the UI.
      if (e instanceof RemnawaveError) {
        await this.repo.recordError(uuid, e.message);
        throw new BadGatewayException(e.message);
      }
      this.logger.error(`Import of "${row.name}" failed`, e instanceof Error ? e.stack : String(e));
      await this.repo.recordError(uuid, 'Import failed, see the server log');
      throw e;
    } finally {
      this.busy.delete(uuid);
    }
  }

  // ---- helpers ------------------------------------------------------------------------------

  /** Billing service per importer node key, by IP (also through DNS) then by name. */
  private async matchServices(
    nodes: {
      key: string;
      label: string;
      remnawaveNodeUuid: string | null;
      addresses: { value: string }[];
      meta: Json;
    }[],
    projectUuid: string | null,
    warnings: string[],
  ): Promise<Map<string, string>> {
    const services: MatchService[] = (await this.services.listWithMeta()).map((s) => ({
      uuid: s.uuid,
      name: s.name,
      projectUuid: s.projectUuid,
      ips: extractServiceIps(s.meta),
    }));
    const out = new Map<string, string>();
    for (const n of nodes) {
      if (!n.remnawaveNodeUuid) continue;
      const address =
        typeof n.meta.address === 'string' ? n.meta.address : (n.addresses[0]?.value ?? '');
      // Every IP the node is known by: its address (through DNS when a domain) plus the IPs
      // found in its xray config (inbound listen, sendThrough). The config ones are exact, DNS
      // can lie (proxied domains, fake-IP resolvers).
      const ips = [...n.addresses.map((a) => a.value), ...(await resolveIps(address))];
      const name = n.label.replace(/ · IP A$/, '');
      const r = matchService({ name, ips }, services, projectUuid);
      if (r && 'uuid' in r) out.set(n.key, r.uuid);
      else if (r)
        warnings.push(
          `Node "${name}" matches several services (${r.ambiguous.join(', ')}): not linked`,
        );
    }
    return out;
  }

  private async get(uuid: string): Promise<Row> {
    const row = await this.repo.findByUuid(uuid);
    if (!row) throw new NotFoundException('Integration not found');
    return row;
  }

  private async ensureMap(uuid: string): Promise<void> {
    if (!(await this.maps.exists(uuid))) throw new NotFoundException('Map not found');
  }

  private assertUrl(url: string): void {
    const c = checkPanelUrl(url);
    if (!c.ok) throw new BadRequestException(c.reason);
  }

  private client(row: Row): RemnawaveClient {
    if (!row.tokenEnc) throw new BadRequestException('No API token is set');
    try {
      return new RemnawaveClient({
        baseUrl: row.baseUrl,
        token: this.crypto.decrypt(row.tokenEnc),
        extraHeaders: row.extraHeadersEnc
          ? (JSON.parse(this.crypto.decrypt(row.extraHeadersEnc)) as Record<string, string>)
          : {},
      });
    } catch (e) {
      if (e instanceof RemnawaveError) throw new BadRequestException(e.message);
      throw e;
    }
  }
}

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

/** The address itself when it is an IP, else its A records (best effort, short timeout). */
async function resolveIps(address: string): Promise<string[]> {
  const host = address.trim();
  if (!host) return [];
  if (IPV4.test(host)) return [host];
  try {
    return await Promise.race([
      dns.resolve4(host),
      new Promise<string[]>((resolve) => setTimeout(() => resolve([]), DNS_TIMEOUT_MS)),
    ]);
  } catch {
    return [];
  }
}

function map(r: Row): IntegrationDto {
  return {
    uuid: r.uuid,
    name: r.name,
    mapUuid: r.mapUuid,
    enabled: r.enabled,
    baseUrl: r.baseUrl,
    tokenSet: r.tokenEnc !== null,
    extraHeadersSet: r.extraHeadersEnc !== null,
    subscriptionUrl: r.subscriptionUrl,
    panelServiceUuid: r.panelServiceUuid,
    subServiceUuid: r.subServiceUuid,
    autoSync: r.autoSync,
    lastSyncAt: dateToIso(r.lastSyncAt),
    lastSyncError: r.lastSyncError,
    createdAt: dateToIso(r.createdAt)!,
    updatedAt: dateToIso(r.updatedAt)!,
  };
}
