import { Injectable } from '@nestjs/common';
import type { AdoptTabbyProfilesResult, ServiceSshTarget } from '@infra/shared';
import { TopologyLinksRepository } from '@repositories/topology/topology-links.repository';
import { TopologyNodesRepository } from '@repositories/topology/topology-nodes.repository';
import { TopologyServicesRepository } from '@repositories/topology/topology-services.repository';
import { TopologySettingsRepository } from '@repositories/topology/topology-settings.repository';
import { type TabbyNodeInput, uniqueNames } from './tabby';
import { layoutTabby, profileId, renderTabbyYaml, type TabbyItem } from './tabby-config';
import { extractServiceIps, resolveSshHost } from './topology.utils';

/** Flag country: a hand-set one, else the billing service's, else what Remnawave reports. */
const countryOf = (n: {
  meta: unknown;
  service?: { countryCode: string | null } | null;
}): string | null => {
  const m = asRecord(n.meta);
  const ok = (c: unknown): c is string =>
    typeof c === 'string' && /^[A-Z]{2}$/.test(c) && c !== 'XX';
  if (ok(m.countryManual)) return m.countryManual;
  if (ok(n.service?.countryCode)) return n.service.countryCode;
  return ok(m.countryCode) ? m.countryCode : null;
};

const asRecord = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

@Injectable()
export class TabbyService {
  constructor(
    private readonly nodes: TopologyNodesRepository,
    private readonly links: TopologyLinksRepository,
    private readonly services: TopologyServicesRepository,
    private readonly settings: TopologySettingsRepository,
  ) {}

  /** Nodes that have somewhere to SSH to, with every default filled in. */
  private async resolved() {
    const [rows, settings, links] = await Promise.all([
      this.nodes.listAll(),
      this.settings.ensure(),
      this.links.listAllVisible(),
    ]);
    const roleOf = new Map(rows.map((r) => [r.uuid, r.role]));
    // A bridge feeds the nodes its bridge / chain links point at.
    const bridgeOf = new Map<string, string>();
    for (const l of links) {
      if ((l.kind === 'bridge' || l.kind === 'chain') && roleOf.get(l.fromUuid) === 'bridge') {
        if (!bridgeOf.has(l.toUuid)) bridgeOf.set(l.toUuid, l.fromUuid);
      }
    }
    const out: (TabbyNodeInput & {
      hasProfile: boolean;
      serviceUuid: string | null;
      item: TabbyItem;
      aliases: string[];
    })[] = [];
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
      // "Poland · IP A" is one server: the Tabby profile is just "Poland".
      const name = (n.tabbyProfile || n.label || n.service?.name || host).replace(
        /\s*·\s*IP [AB]$/,
        '',
      );
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
        item: {
          uuid: n.uuid,
          name,
          role: n.role,
          country: countryOf(n),
          host,
          port: n.sshPort ?? settings.defaultSshPort,
          user: n.sshUser,
          bridgeUuid: bridgeOf.get(n.uuid) ?? null,
          rootName: n.map.project?.name ?? n.map.name,
        },
        // Every address this server is known by: lets a script match an existing Tabby host.
        aliases: [
          ...addresses.map((a) => a.value),
          ...extractServiceIps(n.service?.meta),
          ...(typeof rwAddress === 'string' ? [rwAddress] : []),
        ],
      });
    }
    const unique = uniqueNames(names);
    return out.map((o) => {
      const name = unique.get(o.uuid) ?? o.name;
      return { ...o, name, item: { ...o.item, name } };
    });
  }

  /** `profiles:` and `groups:` sections for Tabby's config.yaml: folders by role / bridge, flags. */
  async yaml(): Promise<string> {
    return renderTabbyYaml(layoutTabby((await this.resolved()).map((r) => r.item)));
  }

  /** The same data, structured, for scripts that merge it into an existing Tabby config. */
  async config() {
    const resolved = await this.resolved();
    const layout = layoutTabby(resolved.map((r) => r.item));
    const idOf = (r: { item: TabbyItem }) => profileId(r.item.name, r.item.uuid);
    const items = resolved.map((r) => ({
      ...r.item,
      aliases: r.aliases,
      profile: layout.profiles.find((p) => p.id === idOf(r)),
    }));
    return { items, ...layout };
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
