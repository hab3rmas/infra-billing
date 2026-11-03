// Match a Remnawave node to a billing service: by IP first (the node address, or what its domain
// resolves to), then by name. Candidates of the map's project win over the rest. Pure.

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

/**
 * An address worth matching on: a public IPv4. Loopback, private, link-local and the benchmark
 * range 198.18.0.0/15 are out: that range is what a fake-IP DNS (Clash, sing-box and similar)
 * hands out for every domain, so resolving through it would "match" nothing real.
 */
export function isUsableIp(ip: string): boolean {
  const m = IPV4.exec(ip.trim());
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  if ([a, b, Number(m[3]), Number(m[4])].some((x) => x > 255)) return false;
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 198 && (b === 18 || b === 19)) return false;
  return true;
}

export interface MatchService {
  uuid: string;
  name: string;
  projectUuid: string;
  ips: string[];
}

export type MatchResult = { uuid: string } | { ambiguous: string[] } | null;

const pick = (found: MatchService[], preferProject: string | null): MatchResult => {
  if (found.length === 0) return null;
  const inProject = preferProject ? found.filter((s) => s.projectUuid === preferProject) : [];
  const pool = inProject.length > 0 ? inProject : found;
  if (pool.length === 1) return { uuid: pool[0].uuid };
  return { ambiguous: pool.map((s) => s.name) };
};

export function matchService(
  node: { name: string; ips: string[] },
  services: MatchService[],
  preferProject: string | null,
): MatchResult {
  const usable = node.ips.filter(isUsableIp);
  if (usable.length > 0) {
    const ips = new Set(usable);
    const byIp = pick(
      services.filter((s) => s.ips.some((ip) => ips.has(ip))),
      preferProject,
    );
    if (byIp) return byIp;
  }
  const name = node.name.trim().toLowerCase();
  return pick(
    services.filter((s) => s.name.trim().toLowerCase() === name),
    preferProject,
  );
}
