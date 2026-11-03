// Match a Remnawave node to a billing service: by IP first (the node address, or what its domain
// resolves to), then by name. Candidates of the map's project win over the rest. Pure.

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
  if (node.ips.length > 0) {
    const ips = new Set(node.ips);
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
