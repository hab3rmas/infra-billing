import { z } from 'zod';
import { currencySchema, isoDateSchema, moneySchema, uuidSchema } from './common';

export const TOPOLOGY_PRESETS = ['vpn', 'web', 'custom'] as const;
export const topologyPresetSchema = z.enum(TOPOLOGY_PRESETS);
export type TopologyPreset = z.infer<typeof topologyPresetSchema>;

export const TOPOLOGY_NODE_KINDS = ['service', 'remnawave', 'external', 'group'] as const;
export const topologyNodeKindSchema = z.enum(TOPOLOGY_NODE_KINDS);
export type TopologyNodeKind = z.infer<typeof topologyNodeKindSchema>;

export const TOPOLOGY_NODE_ROLES = [
  // VPN
  'entry',
  'bridge',
  'relay',
  'exit',
  'panel',
  'subscription',
  // web
  'dns',
  'cdn',
  'waf',
  'loadbalancer',
  'web',
  'app',
  'worker',
  'database',
  'db-replica',
  'cache',
  'queue',
  'storage',
  'search',
  'mail',
  'backup',
  // common
  'bot',
  'monitoring',
  'proxy',
  'bastion',
  'ci',
  'other',
  // externals
  'client',
  'internet',
] as const;
export const topologyNodeRoleSchema = z.enum(TOPOLOGY_NODE_ROLES);
export type TopologyNodeRole = z.infer<typeof topologyNodeRoleSchema>;

export const TOPOLOGY_LINK_KINDS = [
  // VPN traffic
  'entry',
  'bridge',
  'chain',
  'exit',
  'direct',
  'warp',
  // web traffic
  'http',
  'grpc',
  'dns',
  // data
  'db',
  'replication',
  'cache',
  'queue',
  'storage',
  'backup',
  // infra
  'panel',
  'subscription',
  'api',
  'depends',
  'ssh',
  'custom',
] as const;
export const topologyLinkKindSchema = z.enum(TOPOLOGY_LINK_KINDS);
export type TopologyLinkKind = z.infer<typeof topologyLinkKindSchema>;

export const TOPOLOGY_SOURCES = ['manual', 'remnawave'] as const;
export const topologySourceSchema = z.enum(TOPOLOGY_SOURCES);
export type TopologySource = z.infer<typeof topologySourceSchema>;

export const topologyAddressDirectionSchema = z.enum(['in', 'out', 'both']);
export type TopologyAddressDirection = z.infer<typeof topologyAddressDirectionSchema>;

export const topologyAddressSchema = z.object({
  value: z.string().min(1).max(255).describe('IP address or domain'),
  direction: topologyAddressDirectionSchema.describe('Inbound, outbound or both'),
  label: z.string().max(100).nullable().optional().describe('Short note, e.g. "IP A"'),
});
export type TopologyAddress = z.infer<typeof topologyAddressSchema>;

export const topologyLayoutDirectionSchema = z.enum(['RIGHT', 'DOWN']);

// SSH fields. Never a password or a key: only where and as whom to connect.
// hostname / IPv4 / IPv6, no spaces and no '@' (it would smuggle a user into the host).
export const sshHostSchema = z
  .string()
  .min(1)
  .max(255)
  .regex(/^[^\s@]+$/, 'hostname or IP without spaces or @');
export const sshUserSchema = z
  .string()
  .max(64)
  .regex(/^[a-z_][a-z0-9_.-]*$/i, 'unix user name');
export const sshPortSchema = z.number().int().min(1).max(65535);
export const tabbyProfileNameSchema = z
  .string()
  .min(1)
  .max(200)
  .refine(
    (s) => ![...s].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127),
    'no control characters',
  );

const posSchema = z.number().finite();

// ---- maps -----------------------------------------------------------------

export const topologyMapSchema = z.object({
  uuid: uuidSchema.describe('Map UUID'),
  name: z.string().describe('Map name'),
  preset: topologyPresetSchema.describe('Preset: node templates and default link kind'),
  profileUuid: uuidSchema.nullable().describe('Profile (workspace) the map belongs to'),
  projectUuid: uuidSchema.nullable().describe('Project the map is for'),
  sortOrder: z.number().int().describe('Sort order'),
  nodesCount: z.number().int().nonnegative().describe('Number of nodes').optional(),
  integrationUuids: z
    .array(uuidSchema)
    .describe('Remnawave integrations feeding this map')
    .optional(),
  createdAt: isoDateSchema.describe('Creation timestamp'),
  updatedAt: isoDateSchema.describe('Last update timestamp'),
});
export type TopologyMap = z.infer<typeof topologyMapSchema>;

export const createTopologyMapSchema = z.object({
  name: z.string().min(1).max(100).describe('Map name'),
  preset: topologyPresetSchema.default('custom').describe('Preset'),
  projectUuid: uuidSchema.nullable().optional().describe('Existing project'),
  createProject: z
    .object({ name: z.string().min(1).describe('New project name') })
    .optional()
    .describe('Create a new project in the same transaction (instead of projectUuid)'),
});
export type CreateTopologyMap = z.infer<typeof createTopologyMapSchema>;

export const updateTopologyMapSchema = z.object({
  name: z.string().min(1).max(100).optional().describe('Map name'),
  preset: topologyPresetSchema.optional().describe('Preset'),
  projectUuid: uuidSchema.nullable().optional().describe('Project'),
  sortOrder: z.number().int().optional().describe('Sort order'),
});
export type UpdateTopologyMap = z.infer<typeof updateTopologyMapSchema>;

// ---- nodes ----------------------------------------------------------------

/** Billing service summary shown on a node (null when the node has no service). */
export const topologyServiceSummarySchema = z.object({
  uuid: uuidSchema,
  name: z.string(),
  type: z.string(),
  providerUuid: uuidSchema,
  providerName: z.string(),
  providerIconName: z.string().nullable(),
  providerFaviconLink: z.string().nullable(),
  accountUuid: uuidSchema,
  accountLabel: z.string().nullable(),
  countryCode: z.string().nullable(),
  cost: moneySchema,
  currency: currencySchema,
  period: z.string(),
  nextBillingAt: isoDateSchema.nullable(),
  isActive: z.boolean(),
  projectUuid: uuidSchema,
  ipCandidates: z.array(z.string()).describe('IPs found in the service metadata'),
});
export type TopologyServiceSummary = z.infer<typeof topologyServiceSummarySchema>;

export const topologyNodeSchema = z.object({
  uuid: uuidSchema.describe('Node UUID'),
  mapUuid: uuidSchema.describe('Map UUID'),
  kind: topologyNodeKindSchema.describe('Node kind'),
  role: topologyNodeRoleSchema.describe('Node role'),
  label: z.string().nullable().describe('Overrides the service / Remnawave name'),
  serviceUuid: uuidSchema.nullable().describe('Linked billing service'),
  remnawaveNodeUuid: uuidSchema.nullable().describe('Node uuid in Remnawave'),
  parentUuid: uuidSchema.nullable().describe('Group container'),
  addresses: z.array(topologyAddressSchema).describe('IPs and domains'),
  posX: z.number().nullable().describe('Canvas X'),
  posY: z.number().nullable().describe('Canvas Y'),
  hidden: z.boolean().describe('Hidden from the canvas'),
  source: topologySourceSchema.describe('Created by hand or imported'),
  meta: z.record(z.unknown()).describe('Free-form details (importer data, overrides)'),
  sshHost: z.string().nullable().describe('SSH host'),
  sshPort: z.number().int().nullable().describe('SSH port'),
  sshUser: z.string().nullable().describe('SSH user'),
  tabbyProfile: z.string().nullable().describe('Exact Tabby profile name; null = quickConnect'),
  service: topologyServiceSummarySchema.nullable().describe('Billing service summary'),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
});
export type TopologyNode = z.infer<typeof topologyNodeSchema>;

// Fields the owner can edit on a node (create takes them all optional, update too).
const nodeEditable = z.object({
  role: topologyNodeRoleSchema.describe('Node role'),
  label: z.string().max(100).nullable().describe('Label'),
  serviceUuid: uuidSchema.nullable().describe('Linked billing service'),
  parentUuid: uuidSchema.nullable().describe('Group container'),
  addresses: z.array(topologyAddressSchema).max(50).describe('IPs and domains'),
  posX: posSchema.nullable().describe('Canvas X'),
  posY: posSchema.nullable().describe('Canvas Y'),
  hidden: z.boolean().describe('Hidden from the canvas'),
  sshHost: sshHostSchema.nullable().describe('SSH host'),
  sshPort: sshPortSchema.nullable().describe('SSH port'),
  sshUser: sshUserSchema.nullable().describe('SSH user'),
  tabbyProfile: tabbyProfileNameSchema.nullable().describe('Tabby profile name'),
});

export const createTopologyNodeSchema = nodeEditable.partial().extend({
  mapUuid: uuidSchema.describe('Map UUID'),
  kind: z.enum(['service', 'external', 'group']).describe('Node kind'),
});
export type CreateTopologyNode = z.infer<typeof createTopologyNodeSchema>;

export const updateTopologyNodeSchema = nodeEditable.partial();
export type UpdateTopologyNode = z.infer<typeof updateTopologyNodeSchema>;

export const updateTopologyPositionsSchema = z.object({
  positions: z
    .array(z.object({ uuid: uuidSchema, x: posSchema, y: posSchema }))
    .min(1)
    .max(1000)
    .describe('New canvas coordinates'),
});
export type UpdateTopologyPositions = z.infer<typeof updateTopologyPositionsSchema>;

// ---- links ----------------------------------------------------------------

export const topologyLinkSchema = z.object({
  uuid: uuidSchema.describe('Link UUID'),
  mapUuid: uuidSchema.describe('Map UUID'),
  fromUuid: uuidSchema.describe('Source node'),
  toUuid: uuidSchema.describe('Target node'),
  kind: topologyLinkKindSchema.describe('Link kind'),
  label: z.string().nullable().describe('Label, e.g. outbound tag'),
  route: z.number().int().nullable().describe('vlessRoute number'),
  protocol: z.string().nullable().describe('Protocol, e.g. vless-reality'),
  animated: z.boolean().describe('Show moving dots'),
  hidden: z.boolean().describe('Hidden from the canvas'),
  source: topologySourceSchema.describe('Created by hand or imported'),
  sourceKey: z.string().nullable().describe('Stable importer key'),
  meta: z.record(z.unknown()).describe('Free-form details (inbounds, match rules)'),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
});
export type TopologyLink = z.infer<typeof topologyLinkSchema>;

export const createTopologyLinkSchema = z.object({
  mapUuid: uuidSchema.describe('Map UUID'),
  fromUuid: uuidSchema.describe('Source node'),
  toUuid: uuidSchema.describe('Target node'),
  kind: topologyLinkKindSchema.default('chain').describe('Link kind'),
  label: z.string().max(100).nullable().optional().describe('Label'),
  route: z.number().int().min(0).max(999).nullable().optional().describe('Route number'),
  protocol: z.string().max(50).nullable().optional().describe('Protocol'),
  animated: z.boolean().optional().describe('Show moving dots'),
});
export type CreateTopologyLink = z.infer<typeof createTopologyLinkSchema>;

export const updateTopologyLinkSchema = z.object({
  kind: topologyLinkKindSchema.optional().describe('Link kind'),
  label: z.string().max(100).nullable().optional().describe('Label'),
  route: z.number().int().min(0).max(999).nullable().optional().describe('Route number'),
  protocol: z.string().max(50).nullable().optional().describe('Protocol'),
  animated: z.boolean().optional().describe('Show moving dots'),
  hidden: z.boolean().optional().describe('Hidden from the canvas'),
});
export type UpdateTopologyLink = z.infer<typeof updateTopologyLinkSchema>;

// ---- settings -------------------------------------------------------------

export const topologySettingsSchema = z.object({
  defaultSshUser: sshUserSchema.describe('Default SSH user'),
  defaultSshPort: sshPortSchema.describe('Default SSH port'),
  tabbyEnabled: z.boolean().describe('Show the Open in Tabby buttons'),
  animateEdges: z.boolean().describe('Animate traffic dots on links'),
  showExternal: z.boolean().describe('Show external nodes (clients, internet…)'),
  layoutDirection: topologyLayoutDirectionSchema.describe('Auto-layout direction'),
});
export type TopologySettings = z.infer<typeof topologySettingsSchema>;

export const updateTopologySettingsSchema = topologySettingsSchema.partial();
export type UpdateTopologySettings = z.infer<typeof updateTopologySettingsSchema>;

// ---- graph ----------------------------------------------------------------

export const topologyGraphSchema = z.object({
  map: topologyMapSchema,
  nodes: z.array(topologyNodeSchema),
  links: z.array(topologyLinkSchema),
  settings: topologySettingsSchema,
});
export type TopologyGraph = z.infer<typeof topologyGraphSchema>;

export const seedFromServicesSchema = z.object({
  serviceUuids: z.array(uuidSchema).max(500).optional().describe('Only these services'),
});
export type SeedFromServices = z.infer<typeof seedFromServicesSchema>;

export const seedResultSchema = z.object({
  created: z.number().int().nonnegative().describe('Nodes created'),
});
export type SeedResult = z.infer<typeof seedResultSchema>;

// ---- account → default project -------------------------------------------

export const accountProjectSchema = z.object({
  accountUuid: uuidSchema.describe('Provider account UUID'),
  providerName: z.string().describe('Provider name'),
  accountLabel: z.string().nullable().describe('Account label (null = main account)'),
  projectUuid: uuidSchema.nullable().describe('Default project for new services'),
});
export type AccountProject = z.infer<typeof accountProjectSchema>;

export const setAccountProjectSchema = z.object({
  projectUuid: uuidSchema.nullable().describe('Project, or null to clear'),
});
export type SetAccountProject = z.infer<typeof setAccountProjectSchema>;

export const applyAccountProjectsResultSchema = z.object({
  dryRun: z.boolean(),
  moved: z.number().int().nonnegative().describe('Services moved (or that would be moved)'),
  services: z.array(
    z.object({
      serviceUuid: uuidSchema,
      serviceName: z.string(),
      projectUuid: uuidSchema,
    }),
  ),
});
export type ApplyAccountProjectsResult = z.infer<typeof applyAccountProjectsResultSchema>;

// ---- SSH / Tabby ----------------------------------------------------------

/** Where to SSH for a billing service: used by the "Open in Tabby" button in the services table. */
export const serviceSshTargetSchema = z.object({
  serviceUuid: uuidSchema.describe('Service UUID'),
  host: z.string().describe('SSH host'),
  port: sshPortSchema.describe('SSH port'),
  user: z.string().describe('SSH user'),
  tabbyProfile: z.string().nullable().describe('Tabby profile name; null = quickConnect'),
});
export type ServiceSshTarget = z.infer<typeof serviceSshTargetSchema>;

export const adoptTabbyProfilesResultSchema = z.object({
  updated: z.number().int().nonnegative().describe('Nodes that got a tabbyProfile name'),
});
export type AdoptTabbyProfilesResult = z.infer<typeof adoptTabbyProfilesResultSchema>;
