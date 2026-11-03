// Pure diff between what the importer wants and what is on the map. Decides, per field, what the
// importer may touch: owner edits (flags in meta) and hand-made content always win.
import type { ImportedLink, ImportedNode } from './remnawave.importer';

type Json = Record<string, unknown>;

export interface ExistingNode {
  uuid: string;
  kind: string;
  role: string;
  label: string | null;
  serviceUuid: string | null;
  parentUuid: string | null;
  addresses: unknown;
  hidden: boolean;
  source: string;
  remnawaveNodeUuid: string | null;
  meta: Json;
}

export interface ExistingLink {
  uuid: string;
  kind: string;
  label: string | null;
  route: number | null;
  protocol: string | null;
  source: string;
  sourceKey: string | null;
  meta: Json;
}

export interface NodeCreate {
  key: string;
  data: {
    kind: string;
    role: string;
    label: string;
    remnawaveNodeUuid: string | null;
    serviceUuid: string | null;
    addresses: unknown;
    meta: Json;
  };
  parentKey: string | null;
}

export interface NodeUpdate {
  uuid: string;
  key: string;
  data: Json;
  parentKey: string | null;
}

export interface LinkCreate {
  link: ImportedLink;
}

export interface LinkUpdate {
  uuid: string;
  data: Json;
}

export interface ImportPlan {
  nodeCreates: NodeCreate[];
  nodeUpdates: NodeUpdate[];
  nodeHides: string[];
  linkCreates: LinkCreate[];
  linkUpdates: LinkUpdate[];
  linkDeletes: string[];
  warnings: string[];
}

const asJson = (v: unknown): Json =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : {};
const overridden = (meta: Json, flag: string): boolean => meta[flag] === true;
const overriddenFields = (meta: Json): string[] =>
  Array.isArray(meta.overridden)
    ? meta.overridden.filter((x): x is string => typeof x === 'string')
    : [];

// Postgres jsonb does not keep key order, so compare with sorted keys.
const canon = (v: unknown): unknown =>
  Array.isArray(v)
    ? v.map(canon)
    : v && typeof v === 'object'
      ? Object.fromEntries(
          Object.entries(v as Json)
            .sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0))
            .map(([k, x]) => [k, canon(x)]),
        )
      : v;
const sameJson = (a: unknown, b: unknown) => JSON.stringify(canon(a)) === JSON.stringify(canon(b));

export interface PlanInput {
  integrationUuid: string;
  existingNodes: ExistingNode[];
  existingLinks: ExistingLink[];
  imported: { nodes: ImportedNode[]; links: ImportedLink[] };
  /** Billing service per importer node key (IP / name match); absent = no unambiguous match. */
  serviceMatches: Map<string, string>;
}

export function planImport(input: PlanInput): ImportPlan {
  const { integrationUuid, existingNodes, existingLinks, imported, serviceMatches } = input;
  const plan: ImportPlan = {
    nodeCreates: [],
    nodeUpdates: [],
    nodeHides: [],
    linkCreates: [],
    linkUpdates: [],
    linkDeletes: [],
    warnings: [],
  };

  // ---- nodes ----------------------------------------------------------------------------------
  const byKey = new Map<string, ExistingNode>();
  for (const n of existingNodes) {
    const key = n.meta.importKey;
    if (n.source === 'remnawave' && typeof key === 'string') byKey.set(key, n);
  }
  // (map, remnawave node uuid) is unique: the same node already placed by another integration or by
  // hand cannot be bound twice.
  const boundRw = new Set(existingNodes.map((n) => n.remnawaveNodeUuid).filter(Boolean));
  const seen = new Set<string>();
  for (const n of imported.nodes) {
    seen.add(n.key);
    const existing = byKey.get(n.key);
    const matched = n.serviceUuid ?? serviceMatches.get(n.key) ?? null;
    const importMeta = { ...n.meta, importKey: n.key, integrationUuid };
    if (!existing) {
      let rwUuid = n.remnawaveNodeUuid;
      if (rwUuid && boundRw.has(rwUuid)) {
        plan.warnings.push(
          `Node "${n.label}" is already on this map (another integration): added without the Remnawave binding`,
        );
        rwUuid = null;
      }
      if (rwUuid) boundRw.add(rwUuid);
      plan.nodeCreates.push({
        key: n.key,
        parentKey: n.parentKey,
        data: {
          kind:
            n.kind === 'service' || (n.kind !== 'group' && matched && n.kind === 'external')
              ? 'service'
              : n.kind,
          role: n.role,
          label: n.label,
          remnawaveNodeUuid: rwUuid,
          serviceUuid: matched,
          addresses: n.addresses,
          meta: { ...importMeta, ...(matched && !n.serviceUuid ? { serviceAuto: true } : {}) },
        },
      });
      continue;
    }
    const meta = existing.meta;
    const data: Json = {};
    if (!overridden(meta, 'roleOverridden') && existing.role !== n.role) data.role = n.role;
    if (!overridden(meta, 'labelOverridden') && existing.label !== n.label) data.label = n.label;
    if (!overridden(meta, 'addressesOverridden') && !sameJson(existing.addresses, n.addresses)) {
      data.addresses = n.addresses;
    }
    // Service link: only when the owner has not set or cleared it by hand.
    if (!overridden(meta, 'serviceOverridden') && matched) {
      const ownedByImporter = existing.serviceUuid === null || meta.serviceAuto === true;
      if (ownedByImporter && existing.serviceUuid !== matched) {
        data.serviceUuid = matched;
        if (n.kind === 'external' && existing.kind === 'external') data.kind = 'service';
      }
    }
    const nextMeta = {
      ...meta,
      ...importMeta,
      ...(matched && !n.serviceUuid && data.serviceUuid ? { serviceAuto: true } : {}),
    };
    if (!sameJson(meta, nextMeta)) data.meta = nextMeta;
    const needsParent = n.parentKey !== null && existing.parentUuid === null;
    if (Object.keys(data).length > 0 || needsParent) {
      plan.nodeUpdates.push({
        uuid: existing.uuid,
        key: n.key,
        data,
        parentKey: needsParent ? n.parentKey : null,
      });
    }
  }
  // Gone from the panel: hide, never delete (links and positions the owner made stay put).
  for (const [key, n] of byKey) {
    if (!seen.has(key) && n.meta.integrationUuid === integrationUuid && !n.hidden) {
      plan.nodeHides.push(n.uuid);
    }
  }

  // ---- links ----------------------------------------------------------------------------------
  const prefix = `rw:${integrationUuid}:`;
  const ours = existingLinks.filter(
    (l) => l.source === 'remnawave' && l.sourceKey?.startsWith(prefix),
  );
  const linkByKey = new Map(ours.map((l) => [l.sourceKey as string, l]));
  const wanted = new Set<string>();
  for (const l of imported.links) {
    wanted.add(l.sourceKey);
    const existing = linkByKey.get(l.sourceKey);
    if (!existing) {
      plan.linkCreates.push({ link: l });
      continue;
    }
    const flags = overriddenFields(existing.meta);
    const data: Json = {};
    if (!flags.includes('kind') && existing.kind !== l.kind) data.kind = l.kind;
    if (!flags.includes('label') && existing.label !== l.label) data.label = l.label;
    if (!flags.includes('route') && existing.route !== l.route) data.route = l.route;
    if (!flags.includes('protocol') && existing.protocol !== l.protocol) data.protocol = l.protocol;
    // hidden and animated are never touched after creation: they belong to the owner.
    const nextMeta = { ...existing.meta, ...l.meta };
    if (!sameJson(existing.meta, nextMeta)) data.meta = nextMeta;
    if (Object.keys(data).length > 0) plan.linkUpdates.push({ uuid: existing.uuid, data });
  }
  for (const l of ours) if (!wanted.has(l.sourceKey as string)) plan.linkDeletes.push(l.uuid);
  return plan;
}

export const emptyPlan = (p: ImportPlan): boolean =>
  Object.values(p).every((v) => (v as unknown[]).length === 0);

export { asJson };
