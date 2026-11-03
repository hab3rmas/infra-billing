import { Injectable } from '@nestjs/common';
import { Prisma } from '@generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class TopologyLinksRepository {
  constructor(private readonly prisma: PrismaService) {}

  listByMap(mapUuid: string) {
    return this.prisma.topologyLink.findMany({ where: { mapUuid }, orderBy: { createdAt: 'asc' } });
  }

  findByUuid(uuid: string) {
    return this.prisma.topologyLink.findUnique({ where: { uuid } });
  }

  /** Same (from, to, kind, route) already on the map? `except` skips the link being edited. */
  async findDuplicate(
    f: { mapUuid: string; fromUuid: string; toUuid: string; kind: string; route: number | null },
    except?: string,
  ) {
    return this.prisma.topologyLink.findFirst({
      where: {
        mapUuid: f.mapUuid,
        fromUuid: f.fromUuid,
        toUuid: f.toUuid,
        kind: f.kind,
        route: f.route,
        ...(except ? { uuid: { not: except } } : {}),
      },
      select: { uuid: true },
    });
  }

  create(data: Prisma.TopologyLinkUncheckedCreateInput) {
    return this.prisma.topologyLink.create({ data });
  }

  update(uuid: string, data: Prisma.TopologyLinkUncheckedUpdateInput) {
    return this.prisma.topologyLink.update({ where: { uuid }, data });
  }

  delete(uuid: string) {
    return this.prisma.topologyLink.delete({ where: { uuid } });
  }
}
