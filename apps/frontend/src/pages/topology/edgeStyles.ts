import type { TopologyLinkKind, TopologyPreset } from '@infra/shared';

// The only place with hard-coded colours on the topology page: edge kinds need a palette of their
// own, with a light and a dark variant. Colour is never the sole carrier of meaning: every kind
// also has its own dash pattern, and the legend names them.
export interface EdgeStyle {
  light: string;
  dark: string;
  /** SVG stroke-dasharray; undefined = solid. */
  dash?: string;
  width: number;
  /** Moving dots show user traffic only, not management or dependencies. */
  traffic: boolean;
  /** Management / dependency links, hideable as a group. */
  service: boolean;
  labelKey: string;
}

const NEUTRAL = { light: '#8a8a84', dark: '#8d8c85' };
const ACCENT = { light: '#6d5bd0', dark: '#a597f2' };
const EXIT = { light: '#1f8a70', dark: '#46c2a3' };
const WARP = { light: '#d9730d', dark: '#f0a04b' };
const DATA = { light: '#2f6fb3', dark: '#6aa6e6' };

export const EDGE_STYLES: Record<TopologyLinkKind, EdgeStyle> = {
  entry: {
    ...NEUTRAL,
    width: 1.75,
    traffic: true,
    service: false,
    labelKey: 'topology.link.entry',
  },
  bridge: { ...ACCENT, width: 2, traffic: true, service: false, labelKey: 'topology.link.bridge' },
  chain: { ...ACCENT, width: 2, traffic: true, service: false, labelKey: 'topology.link.chain' },
  exit: { ...EXIT, width: 2, traffic: true, service: false, labelKey: 'topology.link.exit' },
  direct: {
    ...EXIT,
    dash: '6 4',
    width: 1.75,
    traffic: true,
    service: false,
    labelKey: 'topology.link.direct',
  },
  warp: {
    ...WARP,
    dash: '2 4',
    width: 2,
    traffic: true,
    service: false,
    labelKey: 'topology.link.warp',
  },
  http: { ...ACCENT, width: 2, traffic: true, service: false, labelKey: 'topology.link.http' },
  grpc: {
    ...ACCENT,
    dash: '8 3 2 3',
    width: 2,
    traffic: true,
    service: false,
    labelKey: 'topology.link.grpc',
  },
  dns: {
    ...NEUTRAL,
    dash: '2 3',
    width: 1.5,
    traffic: true,
    service: false,
    labelKey: 'topology.link.dns',
  },
  db: { ...DATA, width: 1.25, traffic: true, service: false, labelKey: 'topology.link.db' },
  replication: {
    ...DATA,
    dash: '6 4',
    width: 1.5,
    traffic: false,
    service: false,
    labelKey: 'topology.link.replication',
  },
  cache: { ...WARP, width: 1.25, traffic: true, service: false, labelKey: 'topology.link.cache' },
  queue: {
    ...DATA,
    dash: '10 3 2 3',
    width: 1.25,
    traffic: true,
    service: false,
    labelKey: 'topology.link.queue',
  },
  storage: {
    ...DATA,
    dash: '3 3',
    width: 1.25,
    traffic: true,
    service: false,
    labelKey: 'topology.link.storage',
  },
  backup: {
    ...NEUTRAL,
    dash: '6 4',
    width: 1.5,
    traffic: false,
    service: false,
    labelKey: 'topology.link.backup',
  },
  panel: {
    ...NEUTRAL,
    dash: '3 4',
    width: 1,
    traffic: false,
    service: true,
    labelKey: 'topology.link.panel',
  },
  subscription: {
    ...NEUTRAL,
    dash: '3 4',
    width: 1,
    traffic: false,
    service: true,
    labelKey: 'topology.link.subscription',
  },
  api: {
    ...NEUTRAL,
    dash: '3 4',
    width: 1,
    traffic: false,
    service: true,
    labelKey: 'topology.link.api',
  },
  depends: {
    ...NEUTRAL,
    dash: '3 4',
    width: 1,
    traffic: false,
    service: true,
    labelKey: 'topology.link.depends',
  },
  ssh: {
    ...NEUTRAL,
    dash: '1 4',
    width: 1,
    traffic: false,
    service: true,
    labelKey: 'topology.link.ssh',
  },
  custom: {
    ...NEUTRAL,
    width: 1.5,
    traffic: true,
    service: false,
    labelKey: 'topology.link.custom',
  },
};

/** Default link kind of a map preset. */
export const DEFAULT_LINK_KIND: Record<TopologyPreset, TopologyLinkKind> = {
  vpn: 'chain',
  web: 'http',
  custom: 'custom',
};

/** Kinds worth offering first in the legend / link dialog of a preset. */
export const KINDS_BY_PRESET: Record<TopologyPreset, TopologyLinkKind[]> = {
  vpn: ['entry', 'bridge', 'chain', 'exit', 'direct', 'warp', 'panel', 'subscription'],
  web: [
    'http',
    'grpc',
    'dns',
    'db',
    'replication',
    'cache',
    'queue',
    'storage',
    'backup',
    'ssh',
    'depends',
  ],
  custom: Object.keys(EDGE_STYLES) as TopologyLinkKind[],
};

export const edgeColor = (kind: TopologyLinkKind, dark: boolean): string =>
  dark ? EDGE_STYLES[kind].dark : EDGE_STYLES[kind].light;
