// Deep links into Tabby (https://tabby.sh). Pure and dependency-free (unit-tested).
//
// Tabby registers the `tabby://` scheme and maps the URL host to a CLI command, the query to its
// arguments. Only two commands are ever generated here:
//   tabby://profile?profileName=<name>                         open a saved profile
//   tabby://quickConnect?providerId=ssh&query=<user>@<host>:<port>   quick SSH connection
// SECURITY: never generate `tabby://run?command=…` or any other command, even on request. Old
// Tabby versions had remote code execution through `run` (fixed in 1.0.233).

export const TABBY_MIN_VERSION = '1.0.233';

export interface SshTarget {
  user: string;
  host: string;
  port: number;
}

export function tabbyProfileUrl(profileName: string): string {
  const q = new URLSearchParams({ profileName });
  return `tabby://profile?${q.toString()}`;
}

/** IPv6 goes in square brackets, as in `root@[2001:db8::1]:22`. */
const hostForQuery = (host: string): string =>
  host.includes(':') && !host.startsWith('[') ? `[${host}]` : host;

export function tabbyQuickConnectUrl(p: SshTarget): string {
  const q = new URLSearchParams({
    providerId: 'ssh',
    query: `${p.user}@${hostForQuery(p.host)}:${p.port}`,
  });
  return `tabby://quickConnect?${q.toString()}`;
}

/** `ssh -p 22 root@host` (the port is always spelled out). */
export function sshCommand(p: SshTarget): string {
  return `ssh -p ${p.port} ${p.user}@${p.host}`;
}

export interface TabbyNodeLike {
  sshHost: string | null;
  sshPort: number | null;
  sshUser: string | null;
  tabbyProfile: string | null;
  addresses: { value: string; direction: string }[];
  service?: { ipCandidates: string[] } | null;
  meta?: Record<string, unknown>;
}

export interface TabbyDefaults {
  defaultSshUser: string;
  defaultSshPort: number;
}

/**
 * Where a node connects: the profile deep link when it has a Tabby profile, else quickConnect.
 * Host: explicit sshHost, first inbound address, first service IP, Remnawave node address.
 */
export function resolveTabbyTarget(
  node: TabbyNodeLike,
  settings: TabbyDefaults,
): { url: string; ssh: string; target: SshTarget } | null {
  const inbound = node.addresses.find((a) => a.direction === 'in' || a.direction === 'both');
  const rw = typeof node.meta?.address === 'string' ? node.meta.address : null;
  const host = node.sshHost || inbound?.value || node.service?.ipCandidates[0] || rw;
  if (!host) return null;
  const target = {
    host,
    port: node.sshPort ?? settings.defaultSshPort,
    user: node.sshUser ?? settings.defaultSshUser,
  };
  return {
    url: node.tabbyProfile ? tabbyProfileUrl(node.tabbyProfile) : tabbyQuickConnectUrl(target),
    ssh: sshCommand(target),
    target,
  };
}
