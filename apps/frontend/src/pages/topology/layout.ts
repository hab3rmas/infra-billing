import type { TopologyLink, TopologyNode } from '@infra/shared';
import { NODE_W, nodeHeight, groupSize } from './graph';

export type Positions = Map<string, { x: number; y: number }>;

/** Top-level (not inside a group) visible nodes that have no saved coordinates. */
export const nodesNeedingLayout = (nodes: TopologyNode[]): TopologyNode[] =>
  nodes.filter((n) => !n.hidden && !n.parentUuid && (n.posX == null || n.posY == null));

/**
 * elk `layered` layout of the top-level nodes. Group containers are sized from their children and
 * laid out as one box; the children are stacked inside by `buildFlow`. Only nodes in `targets`
 * are returned, so manual positions always win over the automatic ones.
 */
export async function layoutNodes(
  nodes: TopologyNode[],
  links: TopologyLink[],
  direction: 'RIGHT' | 'DOWN',
  targets: TopologyNode[],
): Promise<Positions> {
  if (targets.length === 0) return new Map();
  // Lazy: elk is ~1.5 MB and only the topology page needs it.
  const { default: ELK } = await import('elkjs/lib/elk.bundled.js');
  const elk = new ELK();

  const top = nodes.filter((n) => !n.hidden && !n.parentUuid);
  const topIds = new Set(top.map((n) => n.uuid));
  const childCount = new Map<string, number>();
  for (const n of nodes) {
    if (n.parentUuid && !n.hidden)
      childCount.set(n.parentUuid, (childCount.get(n.parentUuid) ?? 0) + 1);
  }
  // A link to a child counts as a link to its group, so chains through groups stay in order.
  const owner = new Map(nodes.map((n) => [n.uuid, n.parentUuid ?? n.uuid]));
  const edges = new Map<string, { id: string; sources: string[]; targets: string[] }>();
  for (const l of links) {
    if (l.hidden) continue;
    const from = owner.get(l.fromUuid);
    const to = owner.get(l.toUuid);
    if (!from || !to || from === to || !topIds.has(from) || !topIds.has(to)) continue;
    edges.set(`${from}>${to}`, { id: `${from}>${to}`, sources: [from], targets: [to] });
  }

  const result = await elk.layout({
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': direction,
      // Edge labels need room between layers.
      'elk.layered.spacing.nodeNodeBetweenLayers': '120',
      'elk.spacing.nodeNode': '40',
      'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
    },
    children: top.map((n) => {
      const g = n.kind === 'group' ? groupSize(childCount.get(n.uuid) ?? 0) : null;
      return { id: n.uuid, width: g?.width ?? NODE_W, height: g?.height ?? nodeHeight(n) };
    }),
    edges: [...edges.values()],
  });

  const wanted = new Set(targets.map((n) => n.uuid));
  const out: Positions = new Map();
  for (const c of result.children ?? []) {
    if (wanted.has(c.id) && c.x != null && c.y != null) out.set(c.id, { x: c.x, y: c.y });
  }
  return out;
}
