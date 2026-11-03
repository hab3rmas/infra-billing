import { Injectable } from '@nestjs/common';
import { Prisma } from '@generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

const LIST_INCLUDE = {
  _count: { select: { nodes: true } },
  integrations: { select: { uuid: true } },
} as const;

@Injectable()
export class TopologyMapsRepository {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.topologyMap.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      include: LIST_INCLUDE,
    });
  }

  findWithCounts(uuid: string) {
    return this.prisma.topologyMap.findUnique({ where: { uuid }, include: LIST_INCLUDE });
  }

  async exists(uuid: string): Promise<boolean> {
    const found = await this.prisma.topologyMap.findUnique({
      where: { uuid },
      select: { uuid: true },
    });
    return found !== null;
  }

  /** Create a map; with `newProjectName` the project is created in the same transaction. */
  create(data: Prisma.TopologyMapUncheckedCreateInput, newProjectName?: string) {
    return this.prisma.$transaction(async (tx) => {
      const projectUuid = newProjectName
        ? (await tx.project.create({ data: { name: newProjectName } })).uuid
        : data.projectUuid;
      return tx.topologyMap.create({
        data: { ...data, projectUuid },
        include: LIST_INCLUDE,
      });
    });
  }

  update(uuid: string, data: Prisma.TopologyMapUncheckedUpdateInput) {
    return this.prisma.topologyMap.update({ where: { uuid }, data, include: LIST_INCLUDE });
  }

  delete(uuid: string) {
    return this.prisma.topologyMap.delete({ where: { uuid } });
  }

  /** Copy a map with its nodes, links and positions. Importer bindings are not copied. */
  duplicate(uuid: string, name: string) {
    return this.prisma.$transaction(async (tx) => {
      const src = await tx.topologyMap.findUniqueOrThrow({
        where: { uuid },
        include: { nodes: true, links: true },
      });
      const copy = await tx.topologyMap.create({
        data: {
          name,
          preset: src.preset,
          profileUuid: src.profileUuid,
          projectUuid: src.projectUuid,
          sortOrder: src.sortOrder + 1,
        },
      });
      const idMap = new Map<string, string>();
      for (const n of src.nodes) {
        const created = await tx.topologyNode.create({
          data: {
            mapUuid: copy.uuid,
            kind: n.kind === 'remnawave' ? 'service' : n.kind,
            role: n.role,
            label: n.label,
            serviceUuid: n.serviceUuid,
            addresses: n.addresses as Prisma.InputJsonValue,
            posX: n.posX,
            posY: n.posY,
            hidden: n.hidden,
            source: 'manual',
            meta: n.meta as Prisma.InputJsonValue,
            sshHost: n.sshHost,
            sshPort: n.sshPort,
            sshUser: n.sshUser,
            tabbyProfile: n.tabbyProfile,
          },
        });
        idMap.set(n.uuid, created.uuid);
      }
      for (const n of src.nodes) {
        if (!n.parentUuid) continue;
        await tx.topologyNode.update({
          where: { uuid: idMap.get(n.uuid)! },
          data: { parentUuid: idMap.get(n.parentUuid) ?? null },
        });
      }
      for (const l of src.links) {
        await tx.topologyLink.create({
          data: {
            mapUuid: copy.uuid,
            fromUuid: idMap.get(l.fromUuid)!,
            toUuid: idMap.get(l.toUuid)!,
            kind: l.kind,
            label: l.label,
            route: l.route,
            protocol: l.protocol,
            animated: l.animated,
            hidden: l.hidden,
            source: 'manual',
            meta: l.meta as Prisma.InputJsonValue,
          },
        });
      }
      return tx.topologyMap.findUniqueOrThrow({
        where: { uuid: copy.uuid },
        include: LIST_INCLUDE,
      });
    });
  }
}
