import type { RemnawaveIntegration, TopologyGraph, TopologyNode } from '@infra/shared';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { apiErrorMessage } from '@/api/client';
import { useServices } from '@/api/services';
import { useCreateNode, useServiceSshTargets, useUpdateLink, useUpdateNode } from '@/api/topology';
import { Combobox } from '@/components/Combobox';
import { CountryFlag } from '@/components/CountryFlag';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { notifyError, notifySuccess } from '@/utils/notify';
import { nodeCountry } from '../graph';
import { checkMap, suggestServices } from '../logic';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  graph: TopologyGraph;
  integrations: RemnawaveIntegration[];
  /** Open a node in the side sheet. */
  onOpenNode: (uuid: string) => void;
}

const nameOf = (n: TopologyNode | undefined, fallback: string) =>
  n?.label || n?.service?.name || fallback;

/**
 * "Review the map": everything that needs a decision, in one place and only when there is
 * something to show. Unlinked imported nodes (with suggestions), servers of the project that are on
 * no node, sync warnings, map problems and hidden items.
 */
export function ReviewDialog({ open, onOpenChange, graph, integrations, onOpenNode }: Props) {
  const { t } = useTranslation();
  const mapUuid = graph.map.uuid;
  const updateNode = useUpdateNode(mapUuid);
  const updateLink = useUpdateLink(mapUuid);
  const createNode = useCreateNode(mapUuid);
  const { data: services } = useServices({ isActive: true }, { enabled: open });
  const { data: targets } = useServiceSshTargets();

  const nodeById = useMemo(() => new Map(graph.nodes.map((n) => [n.uuid, n])), [graph.nodes]);
  const taken = useMemo(
    () => new Set(graph.nodes.map((n) => n.serviceUuid).filter((x): x is string => !!x)),
    [graph.nodes],
  );
  // Servers the map's project owns (or all, for a map without a project) that no node represents.
  const free = useMemo(
    () =>
      (services ?? []).filter(
        (s) =>
          (s.type === 'vps' || s.type === 'dedicated') &&
          !taken.has(s.uuid) &&
          (!graph.map.projectUuid || s.projectUuid === graph.map.projectUuid),
      ),
    [services, taken, graph.map.projectUuid],
  );
  // Suggestions come from the map's own project when it has one: a server of another project is
  // rarely the right one, and the picker below still offers the rest.
  const pool = useMemo(
    () =>
      graph.map.projectUuid
        ? (services ?? []).filter((s) => s.projectUuid === graph.map.projectUuid)
        : (services ?? []),
    [services, graph.map.projectUuid],
  );
  const unlinked = graph.nodes.filter(
    (n) => !n.hidden && n.source === 'remnawave' && n.kind === 'remnawave' && !n.serviceUuid,
  );
  const problems = useMemo(() => checkMap(graph.nodes, graph.links), [graph.nodes, graph.links]);
  const warnings = integrations.flatMap((i) => i.lastWarnings.map((w) => `${i.name}: ${w}`));
  const hiddenNodes = graph.nodes.filter((n) => n.hidden);
  const hiddenLinks = graph.links.filter((l) => l.hidden);

  const link = (node: TopologyNode, serviceUuid: string) =>
    updateNode.mutate(
      { uuid: node.uuid, dto: { serviceUuid } },
      {
        onSuccess: () => notifySuccess(t('topology.nodeSaved')),
        onError: (e) => notifyError(apiErrorMessage(e)),
      },
    );

  const addAsNode = (s: { uuid: string; name: string }) =>
    createNode.mutate(
      { mapUuid, kind: 'service', serviceUuid: s.uuid, role: 'other' },
      {
        onSuccess: () => notifySuccess(t('topology.nodeAdded')),
        onError: (e) => notifyError(apiErrorMessage(e)),
      },
    );

  const restoreNode = (n: TopologyNode) =>
    updateNode.mutate({ uuid: n.uuid, dto: { hidden: false } });
  const restoreLink = (uuid: string) => updateLink.mutate({ uuid, dto: { hidden: false } });

  const nothing =
    unlinked.length +
      free.length +
      warnings.length +
      problems.isolated.length +
      problems.cycles.length +
      hiddenNodes.length +
      hiddenLinks.length ===
    0;

  const serviceName = (uuid: string) => services?.find((s) => s.uuid === uuid)?.name ?? uuid;
  const heading = 'text-xs font-medium uppercase tracking-wide text-ink-3';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('topology.reviewTitle')}</DialogTitle>
        </DialogHeader>
        <div className="max-h-[70vh] space-y-6 overflow-y-auto pr-1">
          {nothing && <p className="text-sm text-ink-2">{t('topology.reviewAllGood')}</p>}

          {unlinked.length > 0 && (
            <section className="space-y-2">
              <h3 className={heading}>{t('topology.reviewUnlinked')}</h3>
              <p className="text-xs text-ink-2">{t('topology.reviewUnlinkedHint')}</p>
              <ul className="space-y-2">
                {unlinked.map((n) => {
                  const sug = suggestServices(n, pool, targets ?? [], taken);
                  const c = nodeCountry(n);
                  return (
                    <li key={n.uuid} className="space-y-1.5 rounded-lg bg-secondary p-2.5">
                      <div className="flex items-center gap-2 text-sm">
                        {c && <CountryFlag code={c} />}
                        <button
                          type="button"
                          className="truncate font-medium hover:underline"
                          onClick={() => onOpenNode(n.uuid)}
                        >
                          {nameOf(n, t('topology.unnamed'))}
                        </button>
                        <span className="ml-auto truncate font-mono text-xs text-ink-3">
                          {typeof n.meta.address === 'string' ? n.meta.address : ''}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {sug.slice(0, 3).map((s) => (
                          <Button
                            key={s.serviceUuid}
                            size="sm"
                            variant="outline"
                            className="h-7 bg-card text-xs"
                            onClick={() => link(n, s.serviceUuid)}
                          >
                            {serviceName(s.serviceUuid)}
                            <span className="text-ink-3">
                              {s.reason === 'ip' ? t('topology.byIp') : t('topology.byCountry')}
                            </span>
                          </Button>
                        ))}
                        <div className="w-44">
                          <Combobox
                            value=""
                            onChange={(v) => v && link(n, v)}
                            placeholder={t('topology.pickService')}
                            options={free.map((s) => ({
                              value: s.uuid,
                              label: s.name,
                              hint: s.countryCode ?? undefined,
                            }))}
                          />
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {free.length > 0 && (
            <section className="space-y-2">
              <h3 className={heading}>{t('topology.reviewFree')}</h3>
              <p className="text-xs text-ink-2">{t('topology.reviewFreeHint')}</p>
              <ul className="space-y-1">
                {free.map((s) => (
                  <li key={s.uuid} className="flex items-center gap-2 text-sm">
                    {s.countryCode && <CountryFlag code={s.countryCode} />}
                    <span className="flex-1 truncate">{s.name}</span>
                    <Button size="sm" variant="ghost" onClick={() => addAsNode(s)}>
                      {t('topology.addAsNode')}
                    </Button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {warnings.length > 0 && (
            <section className="space-y-2">
              <h3 className={heading}>{t('topology.reviewWarnings')}</h3>
              <ul className="space-y-1 text-xs text-ink-2">
                {warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </section>
          )}

          {(problems.isolated.length > 0 || problems.cycles.length > 0) && (
            <section className="space-y-2">
              <h3 className={heading}>{t('topology.reviewProblems')}</h3>
              <ul className="space-y-1 text-sm">
                {problems.isolated.map((id) => (
                  <li key={id}>
                    <button
                      type="button"
                      className="hover:underline"
                      onClick={() => onOpenNode(id)}
                    >
                      {nameOf(nodeById.get(id), t('topology.unnamed'))}
                    </button>
                    <span className="text-ink-2"> — {t('topology.noLinksProblem')}</span>
                  </li>
                ))}
                {problems.cycles.map((cycle) => (
                  <li key={cycle.join('>')} className="text-ink-2">
                    {t('topology.cycleProblem')}:{' '}
                    {cycle.map((id) => nameOf(nodeById.get(id), '?')).join(' → ')}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {(hiddenNodes.length > 0 || hiddenLinks.length > 0) && (
            <section className="space-y-2">
              <h3 className={heading}>{t('topology.reviewHidden')}</h3>
              <ul className="space-y-1 text-sm">
                {hiddenNodes.map((n) => (
                  <li key={n.uuid} className="flex items-center gap-2">
                    <span className="flex-1 truncate">{nameOf(n, t('topology.unnamed'))}</span>
                    <Button size="sm" variant="ghost" onClick={() => restoreNode(n)}>
                      {t('topology.show')}
                    </Button>
                  </li>
                ))}
                {hiddenLinks.map((l) => (
                  <li key={l.uuid} className="flex items-center gap-2">
                    <span className="flex-1 truncate">
                      {nameOf(nodeById.get(l.fromUuid), '?')} →{' '}
                      {nameOf(nodeById.get(l.toUuid), '?')}
                      {l.label ? ` (${l.label})` : ''}
                    </span>
                    <Button size="sm" variant="ghost" onClick={() => restoreLink(l.uuid)}>
                      {t('topology.show')}
                    </Button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
