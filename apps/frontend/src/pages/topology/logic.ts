// Pure graph logic of the topology page: chains, routes, map checks, link suggestions. No imports
// (types only) so it can be unit-tested outside the browser.

export interface LogicLink {
  uuid: string;
  fromUuid: string;
  toUuid: string;
  kind: string;
  route: number | null;
  hidden?: boolean;
}

export interface LogicNode {
  uuid: string;
  kind: string;
  label: string | null;
  serviceUuid: string | null;
  parentUuid: string | null;
  hidden: boolean;
  addresses: { value: string; direction: string }[];
  sshHost: string | null;
  meta: Record<string, unknown>;
  service?: { countryCode: string | null } | null;
}

/** Link kinds that are management / dependencies, not user traffic. */
export const SERVICE_KINDS: ReadonlySet<string> = new Set([
  'panel',
  'subscription',
  'api',
  'depends',
  'ssh',
]);

/** Everything upstream and downstream of a node, following link direction (hover highlight). */
export function chainOf(
  nodeId: string,
  links: Pick<LogicLink, 'uuid' | 'fromUuid' | 'toUuid'>[],
): { nodes: Set<string>; edges: Set<string> } {
  const nodes = new Set([nodeId]);
  const edges = new Set<string>();
  const walk = (start: string, forward: boolean) => {
    const queue = [start];
    const seen = new Set([start]);
    while (queue.length) {
      const cur = queue.shift() as string;
      for (const l of links) {
        const [a, b] = forward ? [l.fromUuid, l.toUuid] : [l.toUuid, l.fromUuid];
        if (a !== cur) continue;
        edges.add(l.uuid);
        nodes.add(b);
        if (!seen.has(b)) {
          seen.add(b);
          queue.push(b);
        }
      }
    }
  };
  walk(nodeId, true);
  walk(nodeId, false);
  return { nodes, edges };
}

const trafficLinks = (links: LogicLink[]) =>
  links.filter((l) => !l.hidden && !SERVICE_KINDS.has(l.kind));

export const routeNumbers = (links: LogicLink[]): number[] =>
  [...new Set(trafficLinks(links).flatMap((l) => (l.route === null ? [] : [l.route])))].sort(
    (a, b) => a - b,
  );

/**
 * The path of one route: links numbered with it, then everything downstream through links that are
 * numbered with it or not numbered at all (an exit link usually carries no route number).
 */
export function routeChain(
  route: number,
  links: LogicLink[],
): { nodes: Set<string>; edges: Set<string> } {
  const traffic = trafficLinks(links);
  const nodes = new Set<string>();
  const edges = new Set<string>();
  const queue: string[] = [];
  for (const l of traffic) {
    if (l.route !== route) continue;
    edges.add(l.uuid);
    nodes.add(l.fromUuid);
    nodes.add(l.toUuid);
    queue.push(l.toUuid);
  }
  const seen = new Set<string>();
  while (queue.length) {
    const cur = queue.shift() as string;
    if (seen.has(cur)) continue;
    seen.add(cur);
    for (const l of traffic) {
      if (l.fromUuid !== cur || (l.route !== null && l.route !== route)) continue;
      edges.add(l.uuid);
      nodes.add(l.toUuid);
      queue.push(l.toUuid);
    }
  }
  return { nodes, edges };
}

// ---- map check --------------------------------------------------------------------------------

export interface MapProblems {
  /** Visible nodes with no link at all. */
  isolated: string[];
  /** Node uuids that sit on a cycle of traffic links. */
  cycles: string[][];
}

export function checkMap(nodes: LogicNode[], links: LogicLink[]): MapProblems {
  const visible = nodes.filter((n) => !n.hidden && n.kind !== 'group');
  const live = links.filter((l) => !l.hidden);
  const touched = new Set(live.flatMap((l) => [l.fromUuid, l.toUuid]));
  const isolated = visible.filter((n) => !touched.has(n.uuid)).map((n) => n.uuid);

  // Cycles among traffic links (DFS with colours). A route that loops back is a mistake.
  const out = new Map<string, string[]>();
  for (const l of trafficLinks(links))
    out.set(l.fromUuid, [...(out.get(l.fromUuid) ?? []), l.toUuid]);
  const colour = new Map<string, 1 | 2>();
  const cycles: string[][] = [];
  const stack: string[] = [];
  const visit = (u: string) => {
    colour.set(u, 1);
    stack.push(u);
    for (const v of out.get(u) ?? []) {
      if (colour.get(v) === 1) cycles.push([...stack.slice(stack.indexOf(v)), v]);
      else if (!colour.has(v)) visit(v);
    }
    stack.pop();
    colour.set(u, 2);
  };
  for (const u of out.keys()) if (!colour.has(u)) visit(u);
  return { isolated, cycles };
}

// ---- linking nodes to billing services ---------------------------------------------------------

export interface SuggestService {
  uuid: string;
  name: string;
  countryCode: string | null;
}

export interface SuggestTarget {
  serviceUuid: string;
  host: string;
}

export interface Suggestion {
  serviceUuid: string;
  /** 'ip' = the node has the service's IP; 'country' = same country only. */
  reason: 'ip' | 'country';
}

const known = (c: unknown): c is string => typeof c === 'string' && c.length === 2 && c !== 'XX';

/**
 * Best billing service for a node that has none: an exact IP match wins, otherwise services of the
 * same country that are not on the map yet (several candidates are returned, the owner picks).
 */
export function suggestServices(
  node: LogicNode,
  services: SuggestService[],
  targets: SuggestTarget[],
  taken: ReadonlySet<string>,
): Suggestion[] {
  const hostByService = new Map(targets.map((t) => [t.serviceUuid, t.host]));
  const nodeIps = new Set([node.sshHost, ...node.addresses.map((a) => a.value)].filter(Boolean));
  const free = services.filter((s) => !taken.has(s.uuid));
  const byIp = free.filter((s) => {
    const host = hostByService.get(s.uuid);
    return host !== undefined && nodeIps.has(host);
  });
  if (byIp.length > 0) return byIp.map((s) => ({ serviceUuid: s.uuid, reason: 'ip' as const }));
  const country = known(node.meta.countryCode) ? node.meta.countryCode : null;
  if (!country) return [];
  return free
    .filter((s) => s.countryCode === country)
    .map((s) => ({ serviceUuid: s.uuid, reason: 'country' as const }));
}
