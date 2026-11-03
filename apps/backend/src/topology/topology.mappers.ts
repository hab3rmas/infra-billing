import type { Prisma, TopologyLink, TopologyMap, TopologySettings } from '@generated/prisma/client';
import type {
  TopologyAddress,
  TopologyLink as TopologyLinkDto,
  TopologyMap as TopologyMapDto,
  TopologyNode as TopologyNodeDto,
  TopologyServiceSummary,
  TopologySettings as TopologySettingsDto,
} from '@infra/shared';
import { dateToIso, decimalToString } from '@common/serialize';
import type { NODE_INCLUDE } from '@repositories/topology/topology-nodes.repository';
import { extractServiceIps } from './topology.utils';

type MapRow = TopologyMap & {
  _count?: { nodes: number };
  integrations?: { uuid: string }[];
};

type NodeRow = Prisma.TopologyNodeGetPayload<{ include: typeof NODE_INCLUDE }>;

export function mapTopologyMap(m: MapRow): TopologyMapDto {
  return {
    uuid: m.uuid,
    name: m.name,
    preset: m.preset as TopologyMapDto['preset'],
    profileUuid: m.profileUuid,
    projectUuid: m.projectUuid,
    sortOrder: m.sortOrder,
    nodesCount: m._count?.nodes,
    integrationUuids: m.integrations?.map((i) => i.uuid),
    createdAt: dateToIso(m.createdAt)!,
    updatedAt: dateToIso(m.updatedAt)!,
  };
}

const asRecord = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

function mapServiceSummary(s: NonNullable<NodeRow['service']>): TopologyServiceSummary {
  return {
    uuid: s.uuid,
    name: s.name,
    type: s.type,
    providerUuid: s.providerUuid,
    providerName: s.account.provider.name,
    providerIconName: s.account.provider.iconName,
    providerFaviconLink: s.account.provider.faviconLink,
    accountUuid: s.accountUuid,
    accountLabel: s.account.label,
    countryCode: s.countryCode,
    cost: decimalToString(s.cost)!,
    currency: s.currency,
    period: s.period,
    nextBillingAt: dateToIso(s.nextBillingAt),
    isActive: s.isActive,
    projectUuid: s.projectUuid,
    ipCandidates: extractServiceIps(s.meta),
  };
}

export function mapTopologyNode(n: NodeRow): TopologyNodeDto {
  return {
    uuid: n.uuid,
    mapUuid: n.mapUuid,
    kind: n.kind as TopologyNodeDto['kind'],
    role: n.role as TopologyNodeDto['role'],
    label: n.label,
    serviceUuid: n.serviceUuid,
    remnawaveNodeUuid: n.remnawaveNodeUuid,
    parentUuid: n.parentUuid,
    addresses: Array.isArray(n.addresses) ? (n.addresses as unknown as TopologyAddress[]) : [],
    posX: n.posX,
    posY: n.posY,
    hidden: n.hidden,
    source: n.source as TopologyNodeDto['source'],
    meta: asRecord(n.meta),
    sshHost: n.sshHost,
    sshPort: n.sshPort,
    sshUser: n.sshUser,
    tabbyProfile: n.tabbyProfile,
    service: n.service ? mapServiceSummary(n.service) : null,
    createdAt: dateToIso(n.createdAt)!,
    updatedAt: dateToIso(n.updatedAt)!,
  };
}

export function mapTopologyLink(l: TopologyLink): TopologyLinkDto {
  return {
    uuid: l.uuid,
    mapUuid: l.mapUuid,
    fromUuid: l.fromUuid,
    toUuid: l.toUuid,
    kind: l.kind as TopologyLinkDto['kind'],
    label: l.label,
    route: l.route,
    protocol: l.protocol,
    animated: l.animated,
    hidden: l.hidden,
    source: l.source as TopologyLinkDto['source'],
    sourceKey: l.sourceKey,
    meta: asRecord(l.meta),
    createdAt: dateToIso(l.createdAt)!,
    updatedAt: dateToIso(l.updatedAt)!,
  };
}

export function mapTopologySettings(s: TopologySettings): TopologySettingsDto {
  return {
    defaultSshUser: s.defaultSshUser,
    defaultSshPort: s.defaultSshPort,
    tabbyEnabled: s.tabbyEnabled,
    animateEdges: s.animateEdges,
    showExternal: s.showExternal,
    layoutDirection: s.layoutDirection as TopologySettingsDto['layoutDirection'],
  };
}
