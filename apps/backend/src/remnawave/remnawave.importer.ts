// Pure conversion of a Remnawave snapshot into topology nodes and links. No Nest / Prisma / network:
// the same input always gives the same output, with stable keys, so a repeated sync is idempotent.

export interface RwNode {
  uuid: string;
  name: string;
  address: string;
  port: number | null;
  countryCode: string | null;
  isConnected: boolean;
  isDisabled: boolean;
  configProfileUuid: string | null;
  activeInboundUuids: string[];
}

export interface RwProfile {
  uuid: string;
  name: string;
  /** The xray config: inbounds, outbounds, routing. */
  config: unknown;
  /** Remnawave's own inbound records (uuid + tag), used to match hosts and active inbounds. */
  inbounds: { uuid: string; tag: string }[];
}

export interface RwHost {
  uuid: string;
  remark: string;
  address: string;
  port: number | null;
  isDisabled: boolean;
  inboundUuid: string | null;
  configProfileUuid: string | null;
  vlessRoute: number | null;
}

export interface RwSnapshot {
  integrationUuid: string;
  panelUrl: string;
  subscriptionUrl: string | null;
  panelServiceUuid: string | null;
  subServiceUuid: string | null;
  nodes: RwNode[];
  profiles: RwProfile[];
  hosts: RwHost[];
}

export type ImportedRole =
  | 'entry'
  | 'bridge'
  | 'relay'
  | 'exit'
  | 'panel'
  | 'subscription'
  | 'client'
  | 'internet';

export interface ImportedNode {
  /** Stable key, unique per integration. */
  key: string;
  kind: 'remnawave' | 'external' | 'service' | 'group';
  role: ImportedRole;
  label: string;
  remnawaveNodeUuid: string | null;
  serviceUuid: string | null;
  parentKey: string | null;
  addresses: { value: string; direction: 'in' | 'out' | 'both'; label?: string }[];
  meta: Record<string, unknown>;
}

export interface ImportedLink {
  sourceKey: string;
  fromKey: string;
  toKey: string;
  kind:
    | 'entry'
    | 'bridge'
    | 'chain'
    | 'exit'
    | 'direct'
    | 'warp'
    | 'panel'
    | 'subscription'
    | 'api';
  label: string | null;
  route: number | null;
  protocol: string | null;
  animated: boolean;
  meta: { inbounds?: string[]; match?: string[]; outbound?: string };
}

export interface ImportResult {
  nodes: ImportedNode[];
  links: ImportedLink[];
  warnings: string[];
}

// ---- small helpers ----------------------------------------------------------------------------

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => v !== null && typeof v === 'object' && !Array.isArray(v);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

const MATCH_CAP = 12;
const WARP_HOST = 'engage.cloudflareclient.com';
const PROXY_PROTOCOLS = new Set(['vless', 'vmess', 'trojan', 'shadowsocks']);
const SERVICE_TAGS = new Set(['api', 'dns', 'dns-out', 'block', 'blocked', 'blackhole']);
const RU_TOKENS = /(^|:)(category-ru|ru)$|\.ru$|\\\.ru/i;

/** Hostname of an address or URL, lowercased; brackets and a trailing :port removed. */
export function hostOf(value: string): string {
  let v = value.trim().toLowerCase();
  v = v.replace(/^[a-z]+:\/\//, '').replace(/[/?#].*$/, '');
  if (v.startsWith('[')) return v.slice(1, v.indexOf(']'));
  return /^[^:]+:\d+$/.test(v) ? v.slice(0, v.lastIndexOf(':')) : v;
}

const isAnyAddress = (a: string) => ['', '0.0.0.0', '::', '[::]', '::0'].includes(a);

/** Addresses an outbound points at: vnext / servers / settings.address / wireguard endpoints. */
function outboundTargets(o: Json): string[] {
  const settings = isObj(o.settings) ? o.settings : {};
  const out: string[] = [];
  for (const v of arr(settings.vnext)) if (isObj(v) && str(v.address)) out.push(str(v.address)!);
  for (const s of arr(settings.servers)) if (isObj(s) && str(s.address)) out.push(str(s.address)!);
  if (str(settings.address)) out.push(str(settings.address)!);
  for (const p of arr(settings.peers))
    if (isObj(p) && str(p.endpoint)) out.push(hostOf(str(p.endpoint)!));
  return out.map(hostOf);
}

function streamProtocol(o: Json): string | null {
  const ss = isObj(o.streamSettings) ? o.streamSettings : {};
  const security = str(ss.security);
  const network = str(ss.network);
  const base = security && security !== 'none' ? security : network;
  const proto = str(o.protocol);
  if (!proto) return base;
  return base && base !== proto ? `${proto}-${base}` : proto;
}

interface Rule {
  outboundTag: string;
  route: number | null;
  inbounds: string[];
  match: string[];
}

function parseRules(config: Json): Rule[] {
  const routing = isObj(config.routing) ? config.routing : {};
  const rules: Rule[] = [];
  for (const r of arr(routing.rules)) {
    if (!isObj(r)) continue;
    const outboundTag = str(r.outboundTag);
    if (!outboundTag) continue;
    // Remnawave's own rule field. Be liberal: number or numeric string.
    const rawRoute = r.vlessRoute ?? r.vlessRouteId;
    const routeNum = typeof rawRoute === 'string' ? Number(rawRoute) : rawRoute;
    const route = typeof routeNum === 'number' && Number.isInteger(routeNum) ? routeNum : null;
    const match = [
      ...arr(r.domain).filter((x): x is string => typeof x === 'string'),
      ...arr(r.ip).filter((x): x is string => typeof x === 'string'),
    ];
    const inbounds = arr(r.inboundTag).filter((x): x is string => typeof x === 'string');
    rules.push({ outboundTag, route, inbounds, match });
  }
  return rules;
}

const cap = (xs: string[]) => [...new Set(xs)].slice(0, MATCH_CAP);

// ---- importer ---------------------------------------------------------------------------------

export function buildTopologyFromRemnawave(snap: RwSnapshot): ImportResult {
  const warnings: string[] = [];
  const nodes = new Map<string, ImportedNode>();
  const links = new Map<string, ImportedLink>();
  const k = (...parts: (string | number)[]) => `rw:${snap.integrationUuid}:${parts.join(':')}`;

  const profileById = new Map(snap.profiles.map((p) => [p.uuid, p]));
  const addrIndex = new Map<string, RwNode>();
  for (const n of snap.nodes) addrIndex.set(hostOf(n.address), n);

  // Parsed once per node: its profile's outbounds, rules and inbound addresses.
  interface NodeInfo {
    node: RwNode;
    outbounds: Json[];
    rules: Rule[];
    inboundAddrs: { ip: string; tag: string }[];
    activeTags: Set<string> | null;
  }
  const infos: NodeInfo[] = snap.nodes.map((node) => {
    const profile = node.configProfileUuid ? profileById.get(node.configProfileUuid) : undefined;
    const config = profile && isObj(profile.config) ? profile.config : null;
    if (node.configProfileUuid && !config) {
      warnings.push(`Node "${node.name}": the config profile has no readable config`);
    }
    const activeTags = profile
      ? new Set(
          profile.inbounds
            .filter((i) => node.activeInboundUuids.includes(i.uuid))
            .map((i) => i.tag),
        )
      : null;
    const inboundAddrs: { ip: string; tag: string }[] = [];
    for (const ib of arr(config?.inbounds)) {
      if (!isObj(ib)) continue;
      const tag = str(ib.tag) ?? '';
      const listen = str(ib.listen) ?? '';
      if (isAnyAddress(listen) || listen.startsWith('/') || listen.startsWith('@')) continue;
      if (activeTags && activeTags.size > 0 && !activeTags.has(tag)) continue;
      inboundAddrs.push({ ip: listen, tag });
    }
    return {
      node,
      outbounds: arr(config?.outbounds).filter(isObj),
      rules: config ? parseRules(config) : [],
      inboundAddrs,
      activeTags: activeTags && activeTags.size > 0 ? activeTags : null,
    };
  });

  // Which outbounds of each node point at another Remnawave node (drives roles and link kinds).
  const outgoing = new Map<string, Set<string>>();
  const incoming = new Map<string, Set<string>>();
  for (const info of infos) {
    for (const o of info.outbounds) {
      const proto = str(o.protocol);
      if (!proto || !(PROXY_PROTOCOLS.has(proto) || proto.startsWith('hysteria'))) continue;
      for (const host of outboundTargets(o)) {
        const target = addrIndex.get(host);
        if (!target || target.uuid === info.node.uuid) continue;
        outgoing.set(info.node.uuid, (outgoing.get(info.node.uuid) ?? new Set()).add(target.uuid));
        incoming.set(target.uuid, (incoming.get(target.uuid) ?? new Set()).add(info.node.uuid));
      }
    }
  }
  const roleOf = (uuid: string): ImportedRole => {
    const out = outgoing.has(uuid);
    const inc = incoming.has(uuid);
    return out && inc ? 'relay' : out ? 'bridge' : 'exit';
  };

  const ext = (id: string, role: ImportedRole, label: string): string => {
    const key = k('ext', id);
    if (!nodes.has(key)) {
      nodes.set(key, {
        key,
        kind: 'external',
        role,
        label,
        remnawaveNodeUuid: null,
        serviceUuid: null,
        parentKey: null,
        addresses: [],
        meta: {},
      });
    }
    return key;
  };

  // 1-2, 5: one node per Remnawave node; a node with different in / out IPs becomes a group.
  const entryKey = new Map<string, string>(); // where inbound links land
  const exitKey = new Map<string, string>(); // where outbound links start
  for (const info of infos) {
    const n = info.node;
    const key = k('node', n.uuid);
    const inAddrs = info.inboundAddrs.map((a) => a.ip);
    const sendThrough = info.outbounds
      .map((o) => str(o.sendThrough))
      .filter((x): x is string => x !== null && !isAnyAddress(x));
    const outAddrs = [...new Set(sendThrough)];
    const addresses: ImportedNode['addresses'] = [];
    const domain = hostOf(n.address);
    const split =
      inAddrs.length > 0 && outAddrs.length > 0 && !outAddrs.every((a) => inAddrs.includes(a));
    if (split) {
      for (const ip of new Set(inAddrs))
        addresses.push({ value: ip, direction: 'in', label: 'IP A' });
    } else {
      addresses.push({ value: domain, direction: 'both' });
      for (const ip of new Set(inAddrs)) addresses.push({ value: ip, direction: 'in' });
      for (const ip of outAddrs)
        if (!inAddrs.includes(ip)) addresses.push({ value: ip, direction: 'out' });
    }
    const profile = n.configProfileUuid ? profileById.get(n.configProfileUuid) : undefined;
    const meta = {
      address: n.address,
      port: n.port,
      online: n.isConnected && !n.isDisabled,
      disabled: n.isDisabled,
      countryCode: n.countryCode,
      profile: profile?.name ?? null,
      inbounds: info.activeTags ? [...info.activeTags] : info.inboundAddrs.map((a) => a.tag),
    };

    if (split) {
      const groupKey = k('grp', n.uuid);
      nodes.set(groupKey, {
        key: groupKey,
        kind: 'group',
        role: 'exit',
        label: n.name,
        remnawaveNodeUuid: null,
        serviceUuid: null,
        parentKey: null,
        addresses: [],
        meta: { countryCode: n.countryCode },
      });
      nodes.set(key, {
        key,
        kind: 'remnawave',
        role: roleOf(n.uuid),
        label: `${n.name} · IP A`,
        remnawaveNodeUuid: n.uuid,
        serviceUuid: null,
        parentKey: groupKey,
        addresses: addresses.filter((a) => a.direction === 'in'),
        meta: { ...meta, split: true },
      });
      const outKey = k('node', n.uuid, 'out');
      nodes.set(outKey, {
        key: outKey,
        kind: 'external',
        role: 'exit',
        label: `${n.name} · IP B`,
        remnawaveNodeUuid: null,
        serviceUuid: null,
        parentKey: groupKey,
        addresses: outAddrs.map((value) => ({ value, direction: 'out' as const, label: 'IP B' })),
        meta: { splitOf: n.uuid },
      });
      links.set(k('inner', n.uuid), {
        sourceKey: k('inner', n.uuid),
        fromKey: key,
        toKey: outKey,
        kind: 'chain',
        label: null,
        route: null,
        protocol: null,
        animated: true,
        meta: {},
      });
      entryKey.set(n.uuid, key);
      exitKey.set(n.uuid, outKey);
    } else {
      nodes.set(key, {
        key,
        kind: 'remnawave',
        role: roleOf(n.uuid),
        label: n.name,
        remnawaveNodeUuid: n.uuid,
        serviceUuid: null,
        parentKey: null,
        addresses,
        meta,
      });
      entryKey.set(n.uuid, key);
      exitKey.set(n.uuid, key);
    }
  }

  const addLink = (l: ImportedLink) => {
    const prev = links.get(l.sourceKey);
    if (prev) {
      prev.meta.match = cap([...(prev.meta.match ?? []), ...(l.meta.match ?? [])]);
      prev.meta.inbounds = cap([...(prev.meta.inbounds ?? []), ...(l.meta.inbounds ?? [])]);
      return;
    }
    links.set(l.sourceKey, l);
  };

  // 3-4: outbounds become links, routing rules label them (one link per vlessRoute).
  for (const info of infos) {
    const n = info.node;
    const from = exitKey.get(n.uuid)!;
    const role = roleOf(n.uuid);
    for (const o of info.outbounds) {
      const tag = str(o.tag) ?? str(o.protocol) ?? 'outbound';
      const proto = str(o.protocol);
      if (!proto || proto === 'blackhole' || SERVICE_TAGS.has(tag.toLowerCase())) continue;
      const rules = info.rules.filter((r) => r.outboundTag === tag);
      // One link per vlessRoute. Rules without a route (geo rules) describe every route of the
      // outbound, so they are folded into each routed link instead of making a duplicate edge.
      const routed = [...new Set(rules.map((r) => r.route).filter((r): r is number => r !== null))];
      const routes: (number | null)[] = routed.length > 0 ? routed : [null];

      let toKey: string | null = null;
      let kind: ImportedLink['kind'] = 'chain';
      const targets = outboundTargets(o);

      if (
        proto === 'wireguard' &&
        (targets.some((t) => t.includes(WARP_HOST)) || /warp/i.test(tag))
      ) {
        toKey = ext('warp', 'internet', 'Cloudflare WARP');
        kind = 'warp';
      } else if (/warp/i.test(tag)) {
        toKey = ext('warp', 'internet', 'Cloudflare WARP');
        kind = 'warp';
      } else if (
        PROXY_PROTOCOLS.has(proto) ||
        proto.startsWith('hysteria') ||
        proto === 'wireguard'
      ) {
        const target = targets.map((t) => addrIndex.get(t)).find((x) => x && x.uuid !== n.uuid);
        if (target) {
          toKey = entryKey.get(target.uuid)!;
          kind = role === 'bridge' ? 'bridge' : 'chain';
        } else if (targets[0]) {
          toKey = ext(`addr:${targets[0]}`, 'exit', targets[0]);
          kind = role === 'bridge' ? 'bridge' : 'chain';
          warnings.push(
            `Node "${n.name}": outbound "${tag}" points at ${targets[0]}, which is not a Remnawave node`,
          );
        }
      } else if (proto === 'freedom') {
        const ruMatch = rules.some((r) => r.match.some((m) => RU_TOKENS.test(m)));
        const direct = role === 'bridge' || ruMatch;
        toKey = direct
          ? ext('ru-sites', 'internet', 'RU сайты')
          : ext('internet', 'internet', 'Интернет');
        kind = direct ? 'direct' : 'exit';
      }
      if (!toKey) continue;

      for (const route of routes) {
        const forRoute = rules.filter(
          (r) => r.route === route || (route !== null && r.route === null),
        );
        addLink({
          sourceKey: k(
            'out',
            n.uuid,
            tag,
            toKey.replace(`rw:${snap.integrationUuid}:`, ''),
            route ?? '*',
          ),
          fromKey: from,
          toKey,
          kind,
          label: tag,
          route,
          protocol:
            kind === 'warp' || kind === 'exit' || kind === 'direct' ? null : streamProtocol(o),
          animated: true,
          meta: {
            outbound: tag,
            inbounds: cap(forRoute.flatMap((r) => r.inbounds)),
            match: cap(forRoute.flatMap((r) => r.match)),
          },
        });
      }
    }
  }

  // 6: hosts -> "Clients -> node" entry links.
  const clientsKey = () => ext('clients', 'client', 'Клиенты');
  for (const h of snap.hosts) {
    if (h.isDisabled) continue;
    const node = snap.nodes.find((n) => {
      if (h.configProfileUuid && n.configProfileUuid !== h.configProfileUuid) return false;
      return h.inboundUuid ? n.activeInboundUuids.includes(h.inboundUuid) : false;
    });
    if (!node) continue;
    addLink({
      sourceKey: k('entry', node.uuid, h.vlessRoute ?? '*'),
      fromKey: clientsKey(),
      toKey: entryKey.get(node.uuid)!,
      kind: 'entry',
      label: h.remark || null,
      route: h.vlessRoute,
      protocol: null,
      animated: true,
      meta: {},
    });
  }

  // 7: panel and subscription page.
  const panelHost = hostOf(snap.panelUrl);
  const panelKey = k('panel');
  nodes.set(panelKey, {
    key: panelKey,
    kind: snap.panelServiceUuid ? 'service' : 'external',
    role: 'panel',
    label: 'Remnawave panel',
    remnawaveNodeUuid: null,
    serviceUuid: snap.panelServiceUuid,
    parentKey: null,
    addresses: panelHost ? [{ value: panelHost, direction: 'both' }] : [],
    meta: {},
  });
  for (const n of snap.nodes) {
    addLink({
      sourceKey: k('panel', n.uuid),
      fromKey: panelKey,
      toKey: entryKey.get(n.uuid)!,
      kind: 'panel',
      label: String(n.port ?? 2222),
      route: null,
      protocol: null,
      animated: false,
      meta: {},
    });
  }
  if (snap.subscriptionUrl) {
    const subKey = k('sub');
    nodes.set(subKey, {
      key: subKey,
      kind: snap.subServiceUuid ? 'service' : 'external',
      role: 'subscription',
      label: 'Sub page',
      remnawaveNodeUuid: null,
      serviceUuid: snap.subServiceUuid,
      parentKey: null,
      addresses: [{ value: hostOf(snap.subscriptionUrl), direction: 'both' }],
      meta: {},
    });
    addLink({
      sourceKey: k('sub-panel'),
      fromKey: subKey,
      toKey: panelKey,
      kind: 'api',
      label: 'API',
      route: null,
      protocol: null,
      animated: false,
      meta: {},
    });
    addLink({
      sourceKey: k('clients-sub'),
      fromKey: clientsKey(),
      toKey: subKey,
      kind: 'subscription',
      label: 'подписка',
      route: null,
      protocol: null,
      animated: false,
      meta: {},
    });
  }

  return { nodes: [...nodes.values()], links: [...links.values()], warnings };
}
