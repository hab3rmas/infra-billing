import { Injectable } from '@nestjs/common';
import type { AdoptTabbyProfilesResult, ServiceSshTarget } from '@infra/shared';
import { TopologyNodesRepository } from '@repositories/topology/topology-nodes.repository';
import { TopologyServicesRepository } from '@repositories/topology/topology-services.repository';
import { TopologySettingsRepository } from '@repositories/topology/topology-settings.repository';
import { buildTabbyYaml, type TabbyNodeInput, uniqueNames } from './tabby';
import { extractServiceIps, resolveSshHost } from './topology.utils';

const asRecord = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

@Injectable()
export class TabbyService {
  constructor(
    private readonly nodes: TopologyNodesRepository,
    private readonly services: TopologyServicesRepository,
    private readonly settings: TopologySettingsRepository,
  ) {}

  /** Nodes that have somewhere to SSH to, with every default filled in. */
  private async resolved() {
    const [rows, settings] = await Promise.all([this.nodes.listAll(), this.settings.ensure()]);
    const out: (TabbyNodeInput & { hasProfile: boolean; serviceUuid: string | null })[] = [];
    const names: { uuid: string; name: string }[] = [];
    for (const n of rows) {
      const addresses = Array.isArray(n.addresses)
        ? (n.addresses as { value: string; direction: string }[])
        : [];
      const rwAddress = asRecord(n.meta).address;
      const host = resolveSshHost(
        { sshHost: n.sshHost, addresses },
        extractServiceIps(n.service?.meta),
        typeof rwAddress === 'string' ? rwAddress : null,
      );
      if (!host) continue;
      const name = n.tabbyProfile || n.label || n.service?.name || host;
      names.push({ uuid: n.uuid, name });
      out.push({
        uuid: n.uuid,
        name,
        group: `Infra Billing / ${n.map.project?.name ?? n.service?.countryCode ?? n.map.name}`,
        host,
        port: n.sshPort ?? settings.defaultSshPort,
        user: n.sshUser ?? settings.defaultSshUser,
        hasProfile: n.tabbyProfile !== null,
        serviceUuid: n.serviceUuid,
      });
    }
    const unique = uniqueNames(names);
    return out.map((o) => ({ ...o, name: unique.get(o.uuid) ?? o.name }));
  }

  /** YAML fragment with a `profiles:` list for Tabby's config.yaml. */
  async yaml(): Promise<string> {
    return buildTabbyYaml(await this.resolved());
  }

  /** Set `tabbyProfile` to the exported name where it is empty, so the profile deep link works. */
  async adopt(): Promise<AdoptTabbyProfilesResult> {
    const names = new Map(
      (await this.resolved()).filter((n) => !n.hasProfile).map((n) => [n.uuid, n.name]),
    );
    return { updated: await this.nodes.setTabbyProfiles(names) };
  }

  /**
   * Per billing service: where to connect. A node with a host wins; otherwise the service's own
   * first IP (quickConnect with the default user and port).
   */
  async serviceTargets(): Promise<ServiceSshTarget[]> {
    const [resolved, services, settings] = await Promise.all([
      this.resolved(),
      this.services.listWithMeta(),
      this.settings.ensure(),
    ]);
    const byService = new Map<string, (typeof resolved)[number]>();
    for (const r of resolved)
      if (r.serviceUuid && !byService.has(r.serviceUuid)) byService.set(r.serviceUuid, r);
    const targets: ServiceSshTarget[] = [];
    for (const s of services) {
      const node = byService.get(s.uuid);
      if (node) {
        targets.push({
          serviceUuid: s.uuid,
          host: node.host,
          port: node.port,
          user: node.user,
          tabbyProfile: node.hasProfile ? node.name : null,
        });
        continue;
      }
      const ip = extractServiceIps(s.meta)[0];
      if (ip) {
        targets.push({
          serviceUuid: s.uuid,
          host: ip,
          port: settings.defaultSshPort,
          user: settings.defaultSshUser,
          tabbyProfile: null,
        });
      }
    }
    return targets;
  }
}
