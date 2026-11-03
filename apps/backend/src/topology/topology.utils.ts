// Pure helpers of the topology module (no Nest / Prisma imports, so they are unit-testable).

const IP_KEYS = ['ip', 'mainIp', 'main_ip', 'IP'] as const;
const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;
const IPV6 = /^[0-9a-f:]+$/i;

const isIp = (s: string): boolean => IPV4.test(s) || (s.includes(':') && IPV6.test(s));

function push(out: string[], v: unknown): void {
  if (typeof v !== 'string') return;
  const s = v.trim();
  if (s && isIp(s) && !out.includes(s)) out.push(s);
}

/**
 * Best-effort IPs from a service's `meta`, in the shapes connectors store them: `ip`, `mainIp`,
 * `main_ip`, `IP`, `ipv4[]` and `ips[].ip`. Connectors differ, so anything else is ignored.
 */
export function extractServiceIps(meta: unknown): string[] {
  if (!meta || typeof meta !== 'object') return [];
  const m = meta as Record<string, unknown>;
  const out: string[] = [];
  for (const k of IP_KEYS) push(out, m[k]);
  if (Array.isArray(m.ipv4)) for (const v of m.ipv4) push(out, v);
  if (Array.isArray(m.ips)) {
    for (const v of m.ips) {
      if (typeof v === 'string') push(out, v);
      else if (v && typeof v === 'object') push(out, (v as Record<string, unknown>).ip);
    }
  }
  return out;
}

interface HostNode {
  sshHost: string | null;
  addresses: { value: string; direction: string }[];
}

/**
 * Where to SSH: explicit host, then the node's first inbound address, then the service's first
 * IP, then the Remnawave node address.
 */
export function resolveSshHost(
  node: HostNode,
  serviceIps: string[],
  remnawaveAddress?: string | null,
): string | null {
  if (node.sshHost) return node.sshHost;
  const inbound = node.addresses.find((a) => a.direction === 'in' || a.direction === 'both');
  return inbound?.value ?? serviceIps[0] ?? remnawaveAddress ?? null;
}

export interface ReconcileService {
  uuid: string;
  accountUuid: string;
  projectUuid: string;
  createdAt: Date;
}

export interface ReconcileMapping {
  accountUuid: string;
  projectUuid: string;
  createdAt: Date;
}

/**
 * Which services the reconciler moves into their account's default project: still in the default
 * project, account mapped, created after the mapping, and never placed before. A service is moved
 * at most once, so a later manual move always wins.
 */
export function pickServicesToMove(
  services: ReconcileService[],
  mappings: ReconcileMapping[],
  placed: ReadonlySet<string>,
  defaultProjectUuid: string,
  { ignoreCreatedAt = false }: { ignoreCreatedAt?: boolean } = {},
): { serviceUuid: string; projectUuid: string }[] {
  const byAccount = new Map(mappings.map((m) => [m.accountUuid, m]));
  const out: { serviceUuid: string; projectUuid: string }[] = [];
  for (const s of services) {
    if (s.projectUuid !== defaultProjectUuid || placed.has(s.uuid)) continue;
    const m = byAccount.get(s.accountUuid);
    if (!m || m.projectUuid === defaultProjectUuid) continue;
    if (!ignoreCreatedAt && s.createdAt < m.createdAt) continue;
    out.push({ serviceUuid: s.uuid, projectUuid: m.projectUuid });
  }
  return out;
}
