import { Injectable } from '@nestjs/common';
import { Prisma } from '@generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

// Singleton row with id=1, created lazily on first access.
@Injectable()
export class TopologySettingsRepository {
  constructor(private readonly prisma: PrismaService) {}

  ensure() {
    return this.prisma.topologySettings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
  }

  async update(data: Prisma.TopologySettingsUpdateInput) {
    await this.ensure();
    return this.prisma.topologySettings.update({ where: { id: 1 }, data });
  }
}
