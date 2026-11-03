import type { TopologyGraph, TopologyNode } from '@infra/shared';
import { IconFocus2 } from '@tabler/icons-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useRates } from '@/api/rates';
import { useSettings } from '@/api/settings';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { formatMoney } from '@/utils/format';
import { buildRubMap, monthlyAmount, toBaseAmount } from '@/utils/money';
import { routeChain, routeNumbers } from '../logic';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  graph: TopologyGraph;
  /** Highlight a route on the canvas and close the dialog. */
  onPin: (chain: { nodes: Set<string>; edges: Set<string> }) => void;
}

const label = (n: TopologyNode | undefined) => n?.label || n?.service?.name || '?';

/** Nodes of a chain in flow order (entry first), good enough for a linear route. */
function ordered(chain: { nodes: Set<string>; edges: Set<string> }, graph: TopologyGraph) {
  const links = graph.links.filter((l) => chain.edges.has(l.uuid));
  const incoming = new Map<string, number>();
  for (const l of links) incoming.set(l.toUuid, (incoming.get(l.toUuid) ?? 0) + 1);
  const queue = [...chain.nodes].filter((id) => !incoming.has(id));
  const out: string[] = [];
  const seen = new Set<string>();
  while (queue.length) {
    const id = queue.shift() as string;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    for (const l of links) if (l.fromUuid === id) queue.push(l.toUuid);
  }
  for (const id of chain.nodes) if (!seen.has(id)) out.push(id);
  return out;
}

/**
 * Cost per route: the servers on the path of each vlessRoute number and what they cost together
 * per month, in the panel's base currency. Lives in a dialog so the canvas itself stays quiet.
 */
export function RoutesDialog({ open, onOpenChange, graph, onPin }: Props) {
  const { t } = useTranslation();
  const { data: settings } = useSettings();
  const { data: rates } = useRates();
  const base = settings?.baseCurrency ?? 'RUB';
  const rubPer = useMemo(() => buildRubMap(rates), [rates]);
  const byId = useMemo(() => new Map(graph.nodes.map((n) => [n.uuid, n])), [graph.nodes]);

  const routes = useMemo(
    () =>
      routeNumbers(graph.links).map((route) => {
        const chain = routeChain(route, graph.links);
        const nodes = ordered(chain, graph).map((id) => byId.get(id)) as TopologyNode[];
        const servers = new Map<string, NonNullable<TopologyNode['service']>>();
        for (const n of nodes) if (n?.service) servers.set(n.service.uuid, n.service);
        let total = 0;
        let unconverted = 0;
        const rows = [...servers.values()].map((s) => {
          const monthly = monthlyAmount(s.cost, s.period as never);
          const inBase = toBaseAmount(monthly, s.currency, base, rubPer);
          if (inBase === null) unconverted += 1;
          else total += inBase;
          return { s, monthly, inBase };
        });
        return { route, chain, nodes, rows, total, unconverted };
      }),
    [graph, byId, base, rubPer],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('topology.routesTitle')}</DialogTitle>
        </DialogHeader>
        <div className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
          {routes.length === 0 && <p className="text-sm text-ink-2">{t('topology.routesNone')}</p>}
          {routes.map((r) => (
            <section key={r.route} className="space-y-2 rounded-xl border border-hairline p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium first-letter:uppercase">
                    {t('topology.routeN', { n: r.route })}
                  </p>
                  <p className="text-lg font-medium">
                    {r.rows.length > 0 ? formatMoney(r.total.toFixed(2), base) : '—'}
                    <span className="ml-1 text-xs font-normal text-ink-3">
                      / {t('topology.perMonth')}
                    </span>
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    onPin(r.chain);
                    onOpenChange(false);
                  }}
                >
                  <IconFocus2 className="size-4" />
                  {t('topology.showOnMap')}
                </Button>
              </div>
              <p className="text-xs text-ink-2">{r.nodes.map(label).join(' → ')}</p>
              {r.rows.length > 0 && (
                <ul className="space-y-0.5 text-xs">
                  {r.rows.map(({ s, monthly }) => (
                    <li key={s.uuid} className="flex justify-between gap-3">
                      <span className="truncate">{s.name}</span>
                      <span className="shrink-0 text-ink-2">
                        {formatMoney(monthly.toFixed(2), s.currency)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {r.unconverted > 0 && (
                <p className="text-xs text-warn">
                  {t('topology.routesNoRate', { currency: base, count: r.unconverted })}
                </p>
              )}
              {r.rows.length === 0 && (
                <p className="text-xs text-ink-3">{t('topology.routesNoServers')}</p>
              )}
            </section>
          ))}
          {routes.length > 0 && <p className="text-xs text-ink-3">{t('topology.routesHint')}</p>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
