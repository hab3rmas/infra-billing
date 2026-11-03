import { Injectable } from '@nestjs/common';
import { Prisma } from '@generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/** Node + the billing service summary the graph needs. */
export const NODE_INCLUDE = {
  service: { include: { account: { include: { provider: true } } } },
} as const;

@Injectable()
export class TopologyNodesRepository {
  constructor(private readonly prisma: PrismaService) {}

  listByMap(mapUuid: string) {
    return this.prisma.topologyNode.findMany({
      where: { mapUuid },
      orderBy: { createdAt: 'asc' },
      include: NODE_INCLUDE,
    });
  }

  findByUuid(uuid: string) {
    return this.prisma.topologyNode.findUnique({ where: { uuid }, include: NODE_INCLUDE });
  }

  create(data: Prisma.TopologyNodeUncheckedCreateInput) {
    return this.prisma.topologyNode.create({ data, include: NODE_INCLUDE });
  }

  update(uuid: string, data: Prisma.TopologyNodeUncheckedUpdateInput) {
    return this.prisma.topologyNode.update({ where: { uuid }, data, include: NODE_INCLUDE });
  }

  delete(uuid: string) {
    return this.prisma.topologyNode.delete({ where: { uuid } });
  }

  /** Bulk position save in one transaction. Returns how many nodes were actually updated. */
  async updatePositions(positions: { uuid: string; x: number; y: number }[]): Promise<number> {
    const results = await this.prisma.$transaction(
      positions.map((p) =>
        this.prisma.topologyNode.updateMany({
          where: { uuid: p.uuid },
          data: { posX: p.x, posY: p.y },
        }),
      ),
    );
    return results.reduce((sum, r) => sum + r.count, 0);
  }

  /** (uuid, parentUuid) of nodes in a map, to validate group nesting. */
  listParents(mapUuid: string) {
    return this.prisma.topologyNode.findMany({
      where: { mapUuid },
      select: { uuid: true, parentUuid: true },
    });
  }

  /** Service uuids that already have a node on the map (seed is idempotent). */
  async listServiceUuids(mapUuid: string): Promise<Set<string>> {
    const rows = await this.prisma.topologyNode.findMany({
      where: { mapUuid, serviceUuid: { not: null } },
      select: { serviceUuid: true },
    });
    return new Set(rows.map((r) => r.serviceUuid!));
  }

  createMany(data: Prisma.TopologyNodeUncheckedCreateInput[]) {
    return this.prisma.topologyNode.createMany({ data });
  }
}
