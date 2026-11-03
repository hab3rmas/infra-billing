import { Injectable } from '@nestjs/common';
import { Prisma } from '@generated/prisma/client';
import { PrismaBase } from '../../profiles/prisma-base';

// Reads through the UNSCOPED client on purpose: profiles and the scope inputs describe the scope
// itself, so they must never be narrowed by it.
const WITH_PROJECTS = { projects: { select: { projectUuid: true } } } as const;

@Injectable()
export class ProfilesRepository {
  constructor(private readonly prisma: PrismaBase) {}

  list() {
    return this.prisma.profile.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      include: WITH_PROJECTS,
    });
  }

  findByUuid(uuid: string) {
    return this.prisma.profile.findUnique({ where: { uuid }, include: WITH_PROJECTS });
  }

  findBySlug(slug: string) {
    return this.prisma.profile.findUnique({ where: { slug } });
  }

  create(data: Prisma.ProfileUncheckedCreateInput) {
    return this.prisma.profile.create({ data, include: WITH_PROJECTS });
  }

  update(uuid: string, data: Prisma.ProfileUncheckedUpdateInput) {
    return this.prisma.profile.update({ where: { uuid }, data, include: WITH_PROJECTS });
  }

  /** Hand the maps of a profile over to another one (before the profile is deleted). */
  async moveMaps(from: string, to: string): Promise<void> {
    await this.prisma.topologyMap.updateMany({
      where: { profileUuid: from },
      data: { profileUuid: to },
    });
  }

  async delete(uuid: string): Promise<void> {
    await this.prisma.profile.delete({ where: { uuid } });
  }

  /** Replace the set of projects of a profile (a project belongs to at most one profile). */
  async setProjects(profileUuid: string, projectUuids: string[]): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.profileProject.deleteMany({ where: { profileUuid } }),
      ...projectUuids.map((projectUuid) =>
        this.prisma.profileProject.upsert({
          where: { projectUuid },
          update: { profileUuid },
          create: { projectUuid, profileUuid },
        }),
      ),
    ]);
  }

  async existingProjectUuids(uuids: string[]): Promise<Set<string>> {
    const rows = await this.prisma.project.findMany({
      where: { uuid: { in: uuids } },
      select: { uuid: true },
    });
    return new Set(rows.map((r) => r.uuid));
  }

  /** Everything computeScope needs, in four light queries. */
  async scopeInput() {
    const [profiles, profileProjects, projects, services, accountDefaults] = await Promise.all([
      this.prisma.profile.findMany({
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        select: { uuid: true, name: true },
      }),
      this.prisma.profileProject.findMany(),
      this.prisma.project.findMany({ select: { uuid: true } }),
      this.prisma.service.findMany({ select: { accountUuid: true, projectUuid: true } }),
      this.prisma.accountDefaultProject.findMany({
        select: { accountUuid: true, projectUuid: true },
      }),
    ]);
    return {
      profiles,
      profileProjects,
      allProjectUuids: projects.map((p) => p.uuid),
      services,
      accountDefaults,
    };
  }

  serviceCountsByProject() {
    return this.prisma.service.groupBy({ by: ['projectUuid'], _count: { _all: true } });
  }
}
