import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

// Read-only view of billing services for the topology module (seed and node lookups), so the
// upstream ServicesRepository stays untouched.
@Injectable()
export class TopologyServicesRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Active VPS / dedicated services, optionally narrowed to a project or explicit uuids. */
  listServers(filter: { projectUuid?: string | null; serviceUuids?: string[] }) {
    return this.prisma.service.findMany({
      where: {
        isActive: true,
        type: { in: ['vps', 'dedicated'] },
        ...(filter.projectUuid ? { projectUuid: filter.projectUuid } : {}),
        ...(filter.serviceUuids ? { uuid: { in: filter.serviceUuids } } : {}),
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async exists(uuid: string): Promise<boolean> {
    const found = await this.prisma.service.findUnique({ where: { uuid }, select: { uuid: true } });
    return found !== null;
  }
}
