import type { TopologyGraph, TopologyLink, TopologyNode } from '@infra/shared';
import type { Edge, Node } from '@xyflow/react';
import { EDGE_STYLES } from './edgeStyles';
import { PILL_ROLES } from './roles';

export const NODE_W = 232;
export const NODE_H = 96;
export const EXTERNAL_H = 40;
export const GROUP_PAD = 16;
export const GROUP_HEADER = 36;

export type NodeVariant = 'server' | 'external' | 'group';

export interface TopoNodeData extends Record<string, unknown> {
  node: TopologyNode;
  /** Children of a group, for sizing. */
  childCount: number;
  dimmed: boolean;
  /** On the hovered / picked chain (drawn emphasised). */
  highlighted: boolean;
  /** Vertical flow: handles on top and bottom instead of left and right. */
  vertical: boolean;
}

export interface TopoEdgeData extends Record<string, unknown> {
  link: TopologyLink;
  dimmed: boolean;
  highlighted: boolean;
  animate: boolean;
}

/**
 * Country of a node for its flag: the billing service's, else the one Remnawave reports for the
 * node. An unknown service country ('XX') does not hide a known Remnawave one.
 */
export function nodeCountry(n: TopologyNode): string | null {
  const known = (c: unknown): c is string => typeof c === 'string' && c.length === 2 && c !== 'XX';
  if (known(n.meta.countryManual)) return n.meta.countryManual;
  const fromService = n.service?.countryCode;
  if (known(fromService)) return fromService;
  return known(n.meta.countryCode) ? n.meta.countryCode : (fromService ?? null);
}

// External-kind nodes with a server role (a panel or bot without a billing service) are cards too.
export const variantOf = (n: TopologyNode): NodeVariant =>
  n.kind === 'group'
    ? 'group'
    : n.kind === 'external' && PILL_ROLES.has(n.role)
      ? 'external'
      : 'server';

export const nodeHeight = (n: TopologyNode): number =>
  variantOf(n) === 'external' ? EXTERNAL_H : NODE_H;

export const groupSize = (childCount: number) => ({
  width: NODE_W + GROUP_PAD * 2,
  height: GROUP_HEADER + Math.max(1, childCount) * (NODE_H + GROUP_PAD) + GROUP_PAD / 2,
});

/** Position of the i-th child inside a group (relative to the group, React Flow's convention). */
export const childPosition = (index: number) => ({
  x: GROUP_PAD,
  y: GROUP_HEADER + index * (NODE_H + GROUP_PAD),
});

export interface MapFilter {
  countries: string[];
  onlineOnly: boolean;
}

/** Does a server card pass the filter? Pills and groups are never filtered by themselves. */
export function passesFilter(n: TopologyNode, f: MapFilter | undefined): boolean {
  if (!f || (f.countries.length === 0 && !f.onlineOnly)) return true;
  if (n.kind === 'group' || variantOf(n) === 'external') return true;
  if (f.onlineOnly && n.meta.online === false) return false;
  if (f.countries.length > 0) {
    const c = nodeCountry(n);
    if (!c || !f.countries.includes(c)) return false;
  }
  return true;
}

export interface BuildOptions {
  showExternal: boolean;
  showService: boolean;
  animateEdges: boolean;
  vertical: boolean;
  /** Positions computed by the layout for nodes that have none saved. */
  autoPositions: Map<string, { x: number; y: number }>;
  /** Show only these countries / only nodes that are online (empty / false = no filtering). */
  filter?: MapFilter;
  /** Node whose whole chain is highlighted; everything else is dimmed. */
  highlight: Set<string> | null;
  highlightEdges: Set<string> | null;
}

/** API graph → React Flow nodes and edges. Hidden nodes/links and filtered kinds are dropped. */
export function buildFlow(
  graph: TopologyGraph,
  o: BuildOptions,
): { nodes: Node<TopoNodeData>[]; edges: Edge<TopoEdgeData>[] } {
  const visible = graph.nodes.filter(
    (n) => !n.hidden && (o.showExternal || n.kind !== 'external') && passesFilter(n, o.filter),
  );
  const ids = new Set(visible.map((n) => n.uuid));
  const childrenOf = new Map<string, TopologyNode[]>();
  for (const n of visible) {
    if (n.parentUuid && ids.has(n.parentUuid)) {
      childrenOf.set(n.parentUuid, [...(childrenOf.get(n.parentUuid) ?? []), n]);
    }
  }

  const nodes: Node<TopoNodeData>[] = [];
  // Parents must precede their children in React Flow's array.
  const ordered = [
    ...visible.filter((n) => !(n.parentUuid && ids.has(n.parentUuid))),
    ...visible.filter((n) => n.parentUuid && ids.has(n.parentUuid)),
  ];
  for (const n of ordered) {
    const variant = variantOf(n);
    const parent = n.parentUuid && ids.has(n.parentUuid) ? n.parentUuid : undefined;
    const siblings = parent ? (childrenOf.get(parent) ?? []) : [];
    const auto = o.autoPositions.get(n.uuid);
    const position =
      n.posX != null && n.posY != null
        ? { x: n.posX, y: n.posY }
        : parent
          ? childPosition(siblings.findIndex((s) => s.uuid === n.uuid))
          : (auto ?? { x: 0, y: 0 });
    const kids = childrenOf.get(n.uuid)?.length ?? 0;
    const size = variant === 'group' ? groupSize(kids) : undefined;
    nodes.push({
      id: n.uuid,
      type: variant,
      position,
      parentId: parent,
      extent: parent ? 'parent' : undefined,
      data: {
        node: n,
        childCount: kids,
        dimmed: o.highlight ? !o.highlight.has(n.uuid) : false,
        highlighted: o.highlight ? o.highlight.has(n.uuid) : false,
        vertical: o.vertical,
      },
      ...(size ? { style: { width: size.width, height: size.height } } : {}),
      // A group must sit below its children and edges.
      ...(variant === 'group' ? { zIndex: -1 } : {}),
    });
  }

  const edges: Edge<TopoEdgeData>[] = graph.links
    .filter((l) => !l.hidden && ids.has(l.fromUuid) && ids.has(l.toUuid))
    .filter((l) => o.showService || !EDGE_STYLES[l.kind].service)
    .map((l) => ({
      id: l.uuid,
      source: l.fromUuid,
      target: l.toUuid,
      type: 'traffic',
      data: {
        link: l,
        dimmed: o.highlightEdges ? !o.highlightEdges.has(l.uuid) : false,
        highlighted: o.highlightEdges ? o.highlightEdges.has(l.uuid) : false,
        animate: o.animateEdges && l.animated && EDGE_STYLES[l.kind].traffic,
      },
    }));

  return { nodes, edges };
}

export { chainOf } from './logic';
