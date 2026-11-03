import { Injectable } from '@nestjs/common';
import { Prisma } from '@generated/prisma/client';
import type { ImportPlan } from '../../remnawave/remnawave.plan';
import { PrismaService } from '../../prisma/prisma.service';

const asJson = (v: unknown): Prisma.InputJsonValue => v as Prisma.InputJsonValue;

export interface ApplyCounts {
  nodesCreated: number;
  nodesUpdated: number;
  nodesHidden: number;
  linksCreated: number;
  linksUpdated: number;
  linksRemoved: number;
}

@Injectable()
export class RemnawaveRepository {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.remnawaveIntegration.findMany({ orderBy: { createdAt: 'asc' } });
  }

  listAutoSync() {
    return this.prisma.remnawaveIntegration.findMany({
      where: { enabled: true, autoSync: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  findByUuid(uuid: string) {
    return this.prisma.remnawaveIntegration.findUnique({ where: { uuid } });
  }

  create(data: Prisma.RemnawaveIntegrationUncheckedCreateInput) {
    return this.prisma.remnawaveIntegration.create({ data });
  }

  update(uuid: string, data: Prisma.RemnawaveIntegrationUncheckedUpdateInput) {
    return this.prisma.remnawaveIntegration.update({ where: { uuid }, data });
  }

  async markSynced(uuid: string, snapshot: unknown): Promise<void> {
    await this.prisma.remnawaveIntegration.update({
      where: { uuid },
      data: { lastSyncAt: new Date(), lastSyncError: null, lastSnapshot: asJson(snapshot) },
    });
  }

  /** Best effort: recording the failure must not hide the original error. */
  async recordError(uuid: string, message: string): Promise<void> {
    await this.prisma.remnawaveIntegration
      .update({ where: { uuid }, data: { lastSyncError: message.slice(0, 500) } })
      .catch(() => undefined);
  }

  /** Map state the planner diffs against. */
  async mapState(mapUuid: string) {
    const [nodes, links] = await Promise.all([
      this.prisma.topologyNode.findMany({ where: { mapUuid } }),
      this.prisma.topologyLink.findMany({ where: { mapUuid } }),
    ]);
    return { nodes, links };
  }

  /** Apply a plan atomically. Returns the counts for the sync summary. */
  applyPlan(mapUuid: string, plan: ImportPlan): Promise<ApplyCounts> {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.topologyNode.findMany({
        where: { mapUuid, source: 'remnawave' },
        select: { uuid: true, meta: true },
      });
      const keyToUuid = new Map<string, string>();
      for (const n of existing) {
        const key = (n.meta as Record<string, unknown>).importKey;
        if (typeof key === 'string') keyToUuid.set(key, n.uuid);
      }

      // Parents first, then their children.
      const ordered = [
        ...plan.nodeCreates.filter((c) => c.parentKey === null),
        ...plan.nodeCreates.filter((c) => c.parentKey !== null),
      ];
      for (const c of ordered) {
        const created = await tx.topologyNode.create({
          data: {
            mapUuid,
            kind: c.data.kind,
            role: c.data.role,
            label: c.data.label,
            remnawaveNodeUuid: c.data.remnawaveNodeUuid,
            serviceUuid: c.data.serviceUuid,
            parentUuid: c.parentKey ? (keyToUuid.get(c.parentKey) ?? null) : null,
            addresses: asJson(c.data.addresses),
            source: 'remnawave',
            meta: asJson(c.data.meta),
          },
          select: { uuid: true },
        });
        keyToUuid.set(c.key, created.uuid);
      }
      for (const u of plan.nodeUpdates) {
        const data: Prisma.TopologyNodeUncheckedUpdateInput = {};
        for (const [k, v] of Object.entries(u.data)) {
          (data as Record<string, unknown>)[k] = k === 'addresses' || k === 'meta' ? asJson(v) : v;
        }
        if (u.parentKey) data.parentUuid = keyToUuid.get(u.parentKey) ?? null;
        await tx.topologyNode.update({ where: { uuid: u.uuid }, data });
      }
      if (plan.nodeHides.length > 0) {
        await tx.topologyNode.updateMany({
          where: { uuid: { in: plan.nodeHides } },
          data: { hidden: true },
        });
      }

      let linksCreated = 0;
      for (const { link } of plan.linkCreates) {
        const fromUuid = keyToUuid.get(link.fromKey);
        const toUuid = keyToUuid.get(link.toKey);
        if (!fromUuid || !toUuid) continue;
        await tx.topologyLink.create({
          data: {
            mapUuid,
            fromUuid,
            toUuid,
            kind: link.kind,
            label: link.label,
            route: link.route,
            protocol: link.protocol,
            animated: link.animated,
            source: 'remnawave',
            sourceKey: link.sourceKey,
            meta: asJson(link.meta),
          },
        });
        linksCreated += 1;
      }
      for (const u of plan.linkUpdates) {
        const data: Prisma.TopologyLinkUncheckedUpdateInput = {};
        for (const [k, v] of Object.entries(u.data)) {
          (data as Record<string, unknown>)[k] = k === 'meta' ? asJson(v) : v;
        }
        await tx.topologyLink.update({ where: { uuid: u.uuid }, data });
      }
      if (plan.linkDeletes.length > 0) {
        await tx.topologyLink.deleteMany({ where: { uuid: { in: plan.linkDeletes } } });
      }
      return {
        nodesCreated: plan.nodeCreates.length,
        nodesUpdated: plan.nodeUpdates.length,
        nodesHidden: plan.nodeHides.length,
        linksCreated,
        linksUpdated: plan.linkUpdates.length,
        linksRemoved: plan.linkDeletes.length,
      };
    });
  }

  /** Delete the integration; its nodes and links stay as hand-made ones, or go with `purge`. */
  async remove(uuid: string, mapUuid: string, purge: boolean): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const nodeWhere = {
        mapUuid,
        source: 'remnawave',
        meta: { path: ['integrationUuid'], equals: uuid },
      };
      const linkWhere = { mapUuid, source: 'remnawave', sourceKey: { startsWith: `rw:${uuid}:` } };
      if (purge) {
        await tx.topologyLink.deleteMany({ where: linkWhere });
        await tx.topologyNode.deleteMany({ where: nodeWhere });
      } else {
        await tx.topologyLink.updateMany({
          where: linkWhere,
          data: { source: 'manual', sourceKey: null },
        });
        await tx.topologyNode.updateMany({
          where: nodeWhere,
          // remnawave_node_uuid stays: it is only a reference, and keeps the unique per-map binding.
          data: { source: 'manual' },
        });
      }
      await tx.remnawaveIntegration.delete({ where: { uuid } });
    });
  }
}
