import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Profile as ProfileDto } from '@infra/shared';
import { dateToIso } from '@common/serialize';
import { ProfilesRepository } from '@repositories/profiles/profiles.repository';
import { CreateProfileDto, UpdateProfileDto } from './dto/profile.dto';
import { computeScope, type ProfileScope } from './profile-scope';

/** FORK_PROFILES=false is the quick rollback: no scoping, no switcher. */
export const profilesEnabled = (): boolean => process.env.FORK_PROFILES !== 'false';

type Row = NonNullable<Awaited<ReturnType<ProfilesRepository['findByUuid']>>>;

const slugify = (name: string): string =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30) || 'profile';

@Injectable()
export class ProfilesService {
  constructor(private readonly repo: ProfilesRepository) {}

  async list(): Promise<ProfileDto[]> {
    const [rows, counts] = await Promise.all([
      this.repo.list(),
      this.repo.serviceCountsByProject(),
    ]);
    const byProject = new Map(counts.map((c) => [c.projectUuid, c._count._all]));
    return rows.map((r) => this.map(r, byProject));
  }

  async create(dto: CreateProfileDto): Promise<ProfileDto> {
    const slug = dto.slug ?? (await this.freeSlug(slugify(dto.name)));
    if (await this.repo.findBySlug(slug)) throw new ConflictException('Slug is already taken');
    const projectUuids = dto.projectUuids ?? [];
    await this.ensureProjects([
      ...projectUuids,
      ...(dto.defaultProjectUuid ? [dto.defaultProjectUuid] : []),
    ]);
    const last = (await this.repo.list()).at(-1);
    const row = await this.repo.create({
      name: dto.name,
      slug,
      iconName: dto.iconName ?? null,
      iconBg: dto.iconBg ?? null,
      faviconLink: dto.faviconLink || null,
      sortOrder: (last?.sortOrder ?? -1) + 1,
      defaultProjectUuid: dto.defaultProjectUuid ?? null,
      notificationsEnabled: dto.notificationsEnabled ?? true,
      telegramChatId: dto.telegramChatId ?? null,
      telegramTopicId: dto.telegramTopicId ?? null,
    });
    if (projectUuids.length > 0) await this.repo.setProjects(row.uuid, projectUuids);
    return this.get(row.uuid);
  }

  async update(uuid: string, dto: UpdateProfileDto): Promise<ProfileDto> {
    await this.ensureExists(uuid);
    if (dto.slug) {
      const other = await this.repo.findBySlug(dto.slug);
      if (other && other.uuid !== uuid) throw new ConflictException('Slug is already taken');
    }
    if (dto.defaultProjectUuid) await this.ensureProjects([dto.defaultProjectUuid]);
    await this.repo.update(uuid, {
      ...(dto.name !== undefined && { name: dto.name }),
      ...(dto.slug !== undefined && { slug: dto.slug }),
      ...(dto.iconName !== undefined && { iconName: dto.iconName }),
      ...(dto.iconBg !== undefined && { iconBg: dto.iconBg }),
      ...(dto.faviconLink !== undefined && { faviconLink: dto.faviconLink || null }),
      ...(dto.sortOrder !== undefined && { sortOrder: dto.sortOrder }),
      ...(dto.defaultProjectUuid !== undefined && { defaultProjectUuid: dto.defaultProjectUuid }),
      ...(dto.notificationsEnabled !== undefined && {
        notificationsEnabled: dto.notificationsEnabled,
      }),
      ...(dto.telegramChatId !== undefined && { telegramChatId: dto.telegramChatId }),
      ...(dto.telegramTopicId !== undefined && { telegramTopicId: dto.telegramTopicId }),
    });
    return this.get(uuid);
  }

  /** Projects and services are never deleted: they just fall out of every profile. */
  async remove(uuid: string, moveMapsTo?: string): Promise<void> {
    await this.ensureExists(uuid);
    if (moveMapsTo) {
      if (moveMapsTo === uuid) throw new BadRequestException('Pick another profile');
      await this.ensureExists(moveMapsTo);
      await this.repo.moveMaps(uuid, moveMapsTo);
    }
    await this.repo.delete(uuid);
  }

  async setProjects(uuid: string, projectUuids: string[]): Promise<ProfileDto> {
    await this.ensureExists(uuid);
    await this.ensureProjects(projectUuids);
    await this.repo.setProjects(uuid, projectUuids);
    return this.get(uuid);
  }

  async get(uuid: string): Promise<ProfileDto> {
    const profile = (await this.list()).find((p) => p.uuid === uuid);
    if (!profile) throw new NotFoundException('Profile not found');
    return profile;
  }

  /** Scope of one profile (null = projects that belong to no profile). */
  async scopeOf(profileUuid: string | null): Promise<ProfileScope> {
    const input = await this.repo.scopeInput();
    if (profileUuid && !input.profiles.some((p) => p.uuid === profileUuid)) {
      throw new NotFoundException('Profile not found');
    }
    return computeScope(input, profileUuid);
  }

  /** One scope per profile that wants notifications, plus the "outside profiles" bucket. */
  async notificationScopes(): Promise<ProfileScope[]> {
    const [rows, input] = await Promise.all([this.repo.list(), this.repo.scopeInput()]);
    const scopes = rows
      .filter((r) => r.notificationsEnabled)
      .map((r) => computeScope(input, r.uuid));
    const outside = computeScope(input, null);
    if (rows.length > 0 && outside.projectUuids.length > 0) scopes.push(outside);
    return scopes;
  }

  profileRow(uuid: string) {
    return this.repo.findByUuid(uuid);
  }

  private map(r: Row, servicesByProject: Map<string, number>): ProfileDto {
    const projectUuids = r.projects.map((p) => p.projectUuid);
    return {
      uuid: r.uuid,
      name: r.name,
      slug: r.slug,
      iconName: r.iconName,
      iconBg: r.iconBg,
      faviconLink: r.faviconLink,
      sortOrder: r.sortOrder,
      defaultProjectUuid: r.defaultProjectUuid,
      notificationsEnabled: r.notificationsEnabled,
      telegramChatId: r.telegramChatId,
      telegramTopicId: r.telegramTopicId,
      projectUuids,
      servicesCount: projectUuids.reduce((n, p) => n + (servicesByProject.get(p) ?? 0), 0),
      createdAt: dateToIso(r.createdAt)!,
      updatedAt: dateToIso(r.updatedAt)!,
    };
  }

  private async ensureExists(uuid: string): Promise<void> {
    if (!(await this.repo.findByUuid(uuid))) throw new NotFoundException('Profile not found');
  }

  private async ensureProjects(uuids: string[]): Promise<void> {
    const found = await this.repo.existingProjectUuids(uuids);
    if (uuids.some((u) => !found.has(u))) throw new BadRequestException('Unknown project');
  }

  private async freeSlug(base: string): Promise<string> {
    let slug = base;
    for (let i = 2; await this.repo.findBySlug(slug); i += 1) slug = `${base}-${i}`;
    return slug;
  }
}
