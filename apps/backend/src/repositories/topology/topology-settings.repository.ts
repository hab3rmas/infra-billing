import { Injectable } from '@nestjs/common';
import { Prisma } from '@generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

// Singleton row with id=1, created lazily on first access.
@Injectable()
export class TopologySettingsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Read the row, creating it on first use. `INSERT … ON CONFLICT DO NOTHING` makes concurrent
   * first requests safe (an `upsert` races and raises a unique violation).
   */
  async ensure() {
    await this.prisma.topologySettings.createMany({ data: [{ id: 1 }], skipDuplicates: true });
    return this.prisma.topologySettings.findUniqueOrThrow({ where: { id: 1 } });
  }

  async update(data: Prisma.TopologySettingsUpdateInput) {
    await this.ensure();
    return this.prisma.topologySettings.update({ where: { id: 1 }, data });
  }
}
