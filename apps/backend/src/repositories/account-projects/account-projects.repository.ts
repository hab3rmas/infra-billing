import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AccountProjectsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Every account with its provider and default-project mapping (if any). */
  listAccounts() {
    return this.prisma.providerAccount.findMany({
      orderBy: { createdAt: 'asc' },
      include: { provider: { select: { name: true } }, defaultProject: true },
    });
  }

  listMappings() {
    return this.prisma.accountDefaultProject.findMany();
  }

  upsert(accountUuid: string, projectUuid: string) {
    return this.prisma.accountDefaultProject.upsert({
      where: { accountUuid },
      update: { projectUuid },
      create: { accountUuid, projectUuid },
    });
  }

  async remove(accountUuid: string): Promise<void> {
    await this.prisma.accountDefaultProject.deleteMany({ where: { accountUuid } });
  }

  /** Services of mapped accounts that are still in the default project. */
  listUnplaced(defaultProjectUuid: string, accountUuids: string[]) {
    return this.prisma.service.findMany({
      where: { projectUuid: defaultProjectUuid, accountUuid: { in: accountUuids } },
      select: { uuid: true, name: true, accountUuid: true, projectUuid: true, createdAt: true },
    });
  }

  async listPlaced(serviceUuids: string[]): Promise<Set<string>> {
    const rows = await this.prisma.serviceAutoProject.findMany({
      where: { serviceUuid: { in: serviceUuids } },
      select: { serviceUuid: true },
    });
    return new Set(rows.map((r) => r.serviceUuid));
  }

  /** Move services and record that they were placed, atomically. */
  async applyMoves(moves: { serviceUuid: string; projectUuid: string }[]): Promise<void> {
    if (moves.length === 0) return;
    await this.prisma.$transaction([
      ...moves.map((m) =>
        this.prisma.service.update({
          where: { uuid: m.serviceUuid },
          data: { projectUuid: m.projectUuid },
        }),
      ),
      this.prisma.serviceAutoProject.createMany({
        data: moves.map((m) => ({ serviceUuid: m.serviceUuid, projectUuid: m.projectUuid })),
        skipDuplicates: true,
      }),
    ]);
  }
}
