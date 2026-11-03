import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@generated/prisma/client';
import type {
  SeedResult,
  TopologyGraph,
  TopologyLink as TopologyLinkDto,
  TopologyMap as TopologyMapDto,
  TopologyNode as TopologyNodeDto,
  TopologySettings as TopologySettingsDto,
} from '@infra/shared';
import { currentProfileScope } from '../profiles/profile-scope';
import { TopologyLinksRepository } from '@repositories/topology/topology-links.repository';
import { TopologyMapsRepository } from '@repositories/topology/topology-maps.repository';
import { TopologyNodesRepository } from '@repositories/topology/topology-nodes.repository';
import { TopologyServicesRepository } from '@repositories/topology/topology-services.repository';
import { TopologySettingsRepository } from '@repositories/topology/topology-settings.repository';
import {
  CreateTopologyLinkDto,
  CreateTopologyMapDto,
  CreateTopologyNodeDto,
  SeedFromServicesDto,
  UpdateTopologyLinkDto,
  UpdateTopologyMapDto,
  UpdateTopologyNodeDto,
  UpdateTopologyPositionsDto,
  UpdateTopologySettingsDto,
} from './dto/topology.dto';
import {
  mapTopologyLink,
  mapTopologyMap,
  mapTopologyNode,
  mapTopologySettings,
} from './topology.mappers';

@Injectable()
export class TopologyService {
  constructor(
    private readonly maps: TopologyMapsRepository,
    private readonly nodes: TopologyNodesRepository,
    private readonly links: TopologyLinksRepository,
    private readonly settings: TopologySettingsRepository,
    private readonly services: TopologyServicesRepository,
  ) {}

  // ---- maps ---------------------------------------------------------------

  async listMaps(): Promise<TopologyMapDto[]> {
    return (await this.maps.list()).map(mapTopologyMap);
  }

  async createMap(dto: CreateTopologyMapDto): Promise<TopologyMapDto> {
    if (dto.createProject && dto.projectUuid) {
      throw new BadRequestException('Pass either projectUuid or createProject, not both');
    }
    const last = (await this.maps.list()).at(-1);
    const map = await this.maps.create(
      {
        name: dto.name,
        preset: dto.preset,
        projectUuid: dto.projectUuid ?? null,
        // Inside a profile the map belongs to it; in "All" it stays unassigned.
        profileUuid: currentProfileScope()?.profileUuid ?? null,
        sortOrder: (last?.sortOrder ?? -1) + 1,
      },
      dto.createProject?.name,
    );
    return mapTopologyMap(map);
  }

  async updateMap(uuid: string, dto: UpdateTopologyMapDto): Promise<TopologyMapDto> {
    await this.ensureMap(uuid);
    const data: Prisma.TopologyMapUncheckedUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.preset !== undefined) data.preset = dto.preset;
    if (dto.projectUuid !== undefined) data.projectUuid = dto.projectUuid;
    if (dto.sortOrder !== undefined) data.sortOrder = dto.sortOrder;
    return mapTopologyMap(await this.maps.update(uuid, data));
  }

  async removeMap(uuid: string): Promise<void> {
    await this.ensureMap(uuid);
    await this.maps.delete(uuid);
  }

  async duplicateMap(uuid: string): Promise<TopologyMapDto> {
    const src = await this.maps.findWithCounts(uuid);
    if (!src) throw new NotFoundException('Map not found');
    return mapTopologyMap(await this.maps.duplicate(uuid, `${src.name} (copy)`));
  }

  async graph(uuid: string): Promise<TopologyGraph> {
    const map = await this.maps.findWithCounts(uuid);
    if (!map) throw new NotFoundException('Map not found');
    const [nodes, links, settings] = await Promise.all([
      this.nodes.listByMap(uuid),
      this.links.listByMap(uuid),
      this.settings.ensure(),
    ]);
    return {
      map: mapTopologyMap(map),
      nodes: nodes.map(mapTopologyNode),
      links: links.map(mapTopologyLink),
      settings: mapTopologySettings(settings),
    };
  }

  /** Nodes for the active VPS / dedicated services of the map's project that aren't on it yet. */
  async seedFromServices(uuid: string, dto: SeedFromServicesDto): Promise<SeedResult> {
    const map = await this.maps.findWithCounts(uuid);
    if (!map) throw new NotFoundException('Map not found');
    const [servers, placed] = await Promise.all([
      this.services.listServers({
        projectUuid: dto.serviceUuids ? undefined : map.projectUuid,
        serviceUuids: dto.serviceUuids,
      }),
      this.nodes.listServiceUuids(uuid),
    ]);
    const fresh = servers.filter((s) => !placed.has(s.uuid));
    if (fresh.length > 0) {
      await this.nodes.createMany(
        fresh.map((s) => ({
          mapUuid: uuid,
          kind: 'service',
          role: 'other',
          serviceUuid: s.uuid,
          // No position: the frontend lays out nodes without coordinates (elk).
        })),
      );
    }
    return { created: fresh.length };
  }

  // ---- nodes --------------------------------------------------------------

  async createNode(dto: CreateTopologyNodeDto): Promise<TopologyNodeDto> {
    await this.ensureMap(dto.mapUuid);
    if (dto.kind === 'service' && !dto.serviceUuid) {
      throw new BadRequestException('A service node needs serviceUuid');
    }
    if (dto.serviceUuid && !(await this.services.exists(dto.serviceUuid))) {
      throw new NotFoundException('Service not found');
    }
    if (dto.parentUuid) await this.ensureParent(dto.mapUuid, dto.parentUuid);
    const node = await this.nodes.create({
      mapUuid: dto.mapUuid,
      kind: dto.kind,
      role: dto.role ?? 'other',
      label: dto.label ?? null,
      serviceUuid: dto.serviceUuid ?? null,
      parentUuid: dto.parentUuid ?? null,
      addresses: (dto.addresses ?? []) as Prisma.InputJsonValue,
      posX: dto.posX ?? null,
      posY: dto.posY ?? null,
      hidden: dto.hidden ?? false,
      sshHost: dto.sshHost ?? null,
      sshPort: dto.sshPort ?? null,
      sshUser: dto.sshUser ?? null,
      tabbyProfile: dto.tabbyProfile ?? null,
    });
    return mapTopologyNode(node);
  }

  async updateNode(uuid: string, dto: UpdateTopologyNodeDto): Promise<TopologyNodeDto> {
    const node = await this.nodes.findByUuid(uuid);
    if (!node) throw new NotFoundException('Node not found');
    if (dto.serviceUuid && !(await this.services.exists(dto.serviceUuid))) {
      throw new NotFoundException('Service not found');
    }
    if (dto.parentUuid) await this.ensureParent(node.mapUuid, dto.parentUuid, uuid);
    const data: Prisma.TopologyNodeUncheckedUpdateInput = {};
    // Fields the owner really changed on an imported node: the importer must leave them alone.
    const owned: Record<string, boolean> = {};
    if (dto.role !== undefined) {
      data.role = dto.role;
      if (dto.role !== node.role) owned.roleOverridden = true;
    }
    if (dto.label !== undefined && (dto.label ?? null) !== node.label) owned.labelOverridden = true;
    if (
      dto.addresses !== undefined &&
      JSON.stringify(dto.addresses) !== JSON.stringify(node.addresses)
    ) {
      owned.addressesOverridden = true;
    }
    if (dto.serviceUuid !== undefined && dto.serviceUuid !== node.serviceUuid) {
      owned.serviceOverridden = true;
    }
    if (node.source === 'remnawave' && Object.keys(owned).length > 0) {
      data.meta = { ...asObject(node.meta), ...owned } as Prisma.InputJsonValue;
    }
    if (dto.label !== undefined) data.label = dto.label;
    if (dto.serviceUuid !== undefined) data.serviceUuid = dto.serviceUuid;
    if (dto.parentUuid !== undefined) data.parentUuid = dto.parentUuid;
    if (dto.addresses !== undefined) data.addresses = dto.addresses as Prisma.InputJsonValue;
    if (dto.posX !== undefined) data.posX = dto.posX;
    if (dto.posY !== undefined) data.posY = dto.posY;
    if (dto.hidden !== undefined) data.hidden = dto.hidden;
    if (dto.sshHost !== undefined) data.sshHost = dto.sshHost;
    if (dto.sshPort !== undefined) data.sshPort = dto.sshPort;
    if (dto.sshUser !== undefined) data.sshUser = dto.sshUser;
    if (dto.tabbyProfile !== undefined) data.tabbyProfile = dto.tabbyProfile;
    return mapTopologyNode(await this.nodes.update(uuid, data));
  }

  /** Imported nodes are hidden, not deleted: the next sync would bring them straight back. */
  async removeNode(uuid: string): Promise<void> {
    const node = await this.nodes.findByUuid(uuid);
    if (!node) throw new NotFoundException('Node not found');
    if (node.source === 'remnawave') await this.nodes.update(uuid, { hidden: true });
    else await this.nodes.delete(uuid);
  }

  async updatePositions(dto: UpdateTopologyPositionsDto): Promise<{ updated: number }> {
    const updated = await this.nodes.updatePositions(dto.positions);
    if (updated !== dto.positions.length) throw new NotFoundException('Node not found');
    return { updated };
  }

  // ---- links --------------------------------------------------------------

  async createLink(dto: CreateTopologyLinkDto): Promise<TopologyLinkDto> {
    await this.ensureMap(dto.mapUuid);
    if (dto.fromUuid === dto.toUuid) throw new BadRequestException('A link needs two nodes');
    await this.ensureNodesInMap(dto.mapUuid, [dto.fromUuid, dto.toUuid]);
    const route = dto.route ?? null;
    if (await this.links.findDuplicate({ ...dto, route })) {
      throw new ConflictException('This link already exists');
    }
    const link = await this.links.create({
      mapUuid: dto.mapUuid,
      fromUuid: dto.fromUuid,
      toUuid: dto.toUuid,
      kind: dto.kind,
      label: dto.label ?? null,
      route,
      protocol: dto.protocol ?? null,
      animated: dto.animated ?? true,
    });
    return mapTopologyLink(link);
  }

  async updateLink(uuid: string, dto: UpdateTopologyLinkDto): Promise<TopologyLinkDto> {
    const link = await this.links.findByUuid(uuid);
    if (!link) throw new NotFoundException('Link not found');
    const kind = dto.kind ?? link.kind;
    const route = dto.route !== undefined ? dto.route : link.route;
    if (
      (dto.kind !== undefined || dto.route !== undefined) &&
      (await this.links.findDuplicate({ ...link, kind, route }, uuid))
    ) {
      throw new ConflictException('This link already exists');
    }
    const data: Prisma.TopologyLinkUncheckedUpdateInput = {};
    if (dto.kind !== undefined) data.kind = dto.kind;
    if (dto.label !== undefined) data.label = dto.label;
    if (dto.route !== undefined) data.route = dto.route;
    if (dto.protocol !== undefined) data.protocol = dto.protocol;
    if (dto.animated !== undefined) data.animated = dto.animated;
    if (dto.hidden !== undefined) data.hidden = dto.hidden;
    if (link.source === 'remnawave') {
      // Remember what the owner really changed so the importer keeps it on the next sync.
      const current: Record<string, unknown> = {
        kind: link.kind,
        label: link.label,
        route: link.route,
        protocol: link.protocol,
      };
      const changed = ['kind', 'label', 'route', 'protocol'].filter(
        (f) => f in data && (data as Record<string, unknown>)[f] !== current[f],
      );
      if (changed.length > 0) {
        const overridden = new Set<string>(asStringArray(asObject(link.meta).overridden).concat(changed));
        data.meta = {
          ...asObject(link.meta),
          overridden: [...overridden],
        } as Prisma.InputJsonValue;
      }
    }
    return mapTopologyLink(await this.links.update(uuid, data));
  }

  /** Imported links are hidden, not deleted, for the same reason as nodes. */
  async removeLink(uuid: string): Promise<void> {
    const link = await this.links.findByUuid(uuid);
    if (!link) throw new NotFoundException('Link not found');
    if (link.source === 'remnawave') await this.links.update(uuid, { hidden: true });
    else await this.links.delete(uuid);
  }

  // ---- settings -----------------------------------------------------------

  async getSettings(): Promise<TopologySettingsDto> {
    return mapTopologySettings(await this.settings.ensure());
  }

  async updateSettings(dto: UpdateTopologySettingsDto): Promise<TopologySettingsDto> {
    return mapTopologySettings(await this.settings.update(dto));
  }

  // ---- helpers ------------------------------------------------------------

  private async ensureMap(uuid: string): Promise<void> {
    if (!(await this.maps.exists(uuid))) throw new NotFoundException('Map not found');
  }

  private async ensureNodesInMap(mapUuid: string, uuids: string[]): Promise<void> {
    for (const uuid of uuids) {
      const n = await this.nodes.findByUuid(uuid);
      if (!n) throw new NotFoundException('Node not found');
      if (n.mapUuid !== mapUuid) {
        throw new BadRequestException('Nodes of different maps cannot be linked');
      }
    }
  }

  /** The parent must be a node of the same map and must not create a cycle. */
  private async ensureParent(mapUuid: string, parentUuid: string, selfUuid?: string) {
    if (parentUuid === selfUuid) throw new BadRequestException('A node cannot be its own parent');
    const rows = await this.nodes.listParents(mapUuid);
    const parents = new Map(rows.map((r) => [r.uuid, r.parentUuid]));
    if (!parents.has(parentUuid)) throw new BadRequestException('Parent must be on the same map');
    for (let cur: string | null | undefined = parentUuid; cur; cur = parents.get(cur)) {
      if (cur === selfUuid) throw new BadRequestException('Groups cannot contain each other');
    }
  }
}

const asObject = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const asStringArray = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
