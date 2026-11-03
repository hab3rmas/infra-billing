import type { TopologyNodeRole, TopologyPreset } from '@infra/shared';
import {
  type Icon,
  IconActivityHeartbeat,
  IconArrowsJoin,
  IconArrowsSplit,
  IconBolt,
  IconBucket,
  IconCloud,
  IconDatabase,
  IconDatabaseExport,
  IconLayoutDashboard,
  IconLink,
  IconMail,
  IconNetwork,
  IconRobot,
  IconRoute,
  IconSearch,
  IconServer,
  IconShield,
  IconShieldLock,
  IconStack,
  IconTerminal2,
  IconTools,
  IconUsers,
  IconWorld,
} from '@tabler/icons-react';

// Single source for role → icon → label key. VPN roles are accented on the canvas; the rest
// (infra and web servers) stay neutral so VPN chains stand out.
export interface RoleInfo {
  icon: Icon;
  labelKey: string;
  /** true = part of the VPN chain (accent tone). */
  vpn?: boolean;
}

export const ROLES: Record<TopologyNodeRole, RoleInfo> = {
  entry: { icon: IconArrowsJoin, labelKey: 'topology.role.entry', vpn: true },
  bridge: { icon: IconRoute, labelKey: 'topology.role.bridge', vpn: true },
  relay: { icon: IconNetwork, labelKey: 'topology.role.relay', vpn: true },
  exit: { icon: IconServer, labelKey: 'topology.role.exit', vpn: true },
  panel: { icon: IconLayoutDashboard, labelKey: 'topology.role.panel' },
  subscription: { icon: IconLink, labelKey: 'topology.role.subscription' },
  dns: { icon: IconWorld, labelKey: 'topology.role.dns' },
  cdn: { icon: IconCloud, labelKey: 'topology.role.cdn' },
  waf: { icon: IconShield, labelKey: 'topology.role.waf' },
  loadbalancer: { icon: IconArrowsSplit, labelKey: 'topology.role.loadbalancer' },
  web: { icon: IconServer, labelKey: 'topology.role.web' },
  app: { icon: IconServer, labelKey: 'topology.role.app' },
  worker: { icon: IconTools, labelKey: 'topology.role.worker' },
  database: { icon: IconDatabase, labelKey: 'topology.role.database' },
  'db-replica': { icon: IconDatabase, labelKey: 'topology.role.dbReplica' },
  cache: { icon: IconBolt, labelKey: 'topology.role.cache' },
  queue: { icon: IconStack, labelKey: 'topology.role.queue' },
  storage: { icon: IconBucket, labelKey: 'topology.role.storage' },
  search: { icon: IconSearch, labelKey: 'topology.role.search' },
  mail: { icon: IconMail, labelKey: 'topology.role.mail' },
  backup: { icon: IconDatabaseExport, labelKey: 'topology.role.backup' },
  bot: { icon: IconRobot, labelKey: 'topology.role.bot' },
  monitoring: { icon: IconActivityHeartbeat, labelKey: 'topology.role.monitoring' },
  proxy: { icon: IconShieldLock, labelKey: 'topology.role.proxy' },
  bastion: { icon: IconTerminal2, labelKey: 'topology.role.bastion' },
  ci: { icon: IconTools, labelKey: 'topology.role.ci' },
  other: { icon: IconServer, labelKey: 'topology.role.other' },
  client: { icon: IconUsers, labelKey: 'topology.role.client' },
  internet: { icon: IconWorld, labelKey: 'topology.role.internet' },
};

/** Roles drawn as a compact pill (endpoints outside the owned servers) instead of a server card. */
export const PILL_ROLES: ReadonlySet<TopologyNodeRole> = new Set([
  'client',
  'internet',
  'dns',
  'cdn',
  'waf',
  'storage',
  'backup',
]);

/** Quick templates of "Add node". `external` ones need no billing service. */
export interface NodeTemplate {
  role: TopologyNodeRole;
  external: boolean;
  /** Default label (i18n key); empty = ask the owner. */
  labelKey?: string;
}

const T = (role: TopologyNodeRole, external = false, labelKey?: string): NodeTemplate => ({
  role,
  external,
  labelKey,
});

const VPN_TEMPLATES = [
  T('entry'),
  T('bridge'),
  T('relay'),
  T('exit'),
  T('panel', false, 'topology.tpl.panel'),
  T('subscription', false, 'topology.tpl.subscription'),
  T('internet', true, 'topology.tpl.warp'),
  T('client', true, 'topology.tpl.clients'),
  T('internet', true, 'topology.tpl.internet'),
  T('internet', true, 'topology.tpl.ruSites'),
];

const WEB_TEMPLATES = [
  T('dns', true),
  T('cdn', true),
  T('loadbalancer'),
  T('web'),
  T('app'),
  T('worker'),
  T('database'),
  T('db-replica'),
  T('cache'),
  T('queue'),
  T('storage', true),
  T('search'),
  T('mail'),
  T('backup', true),
  T('monitoring'),
  T('bastion'),
  T('ci'),
  T('client', true, 'topology.tpl.users'),
];

const COMMON_TEMPLATES = [
  T('bot', false, 'topology.tpl.bot'),
  T('database', false, 'topology.tpl.database'),
  T('monitoring', false, 'topology.tpl.monitoring'),
  T('other', false, 'topology.tpl.server'),
];

export function templatesFor(preset: TopologyPreset): NodeTemplate[] {
  if (preset === 'vpn') return [...VPN_TEMPLATES, ...COMMON_TEMPLATES];
  if (preset === 'web') return [...WEB_TEMPLATES, ...COMMON_TEMPLATES.slice(0, 1)];
  return [...VPN_TEMPLATES, ...WEB_TEMPLATES, ...COMMON_TEMPLATES];
}
