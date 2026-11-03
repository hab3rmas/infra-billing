import type { TopologyGraph } from '@infra/shared';
import { IconChevronDown, IconChevronUp } from '@tabler/icons-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useServices } from '@/api/services';
import { useProjectStatsFor } from '@/api/topology';
import { Button } from '@/components/ui/button';
import { formatMoney } from '@/utils/format';

// Corner card with the project's cost (the existing /projects/:uuid/stats endpoint) and a hint
// when billed servers of the project are missing from the map.
export function ProjectSummary({
  graph,
  onReview,
  editable,
}: {
  graph: TopologyGraph;
  onReview: () => void;
  editable: boolean;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(() => !window.matchMedia('(max-width: 767px)').matches);
  const projectUuid = graph.map.projectUuid;
  const { data: stats } = useProjectStatsFor(projectUuid);
  const { data: services } = useServices(projectUuid ? { projectUuid, isActive: true } : {}, {
    enabled: Boolean(projectUuid),
  });
  if (!projectUuid) return null;

  const placed = new Set(graph.nodes.map((n) => n.serviceUuid).filter(Boolean));
  const missing = (services ?? []).filter(
    (s) => (s.type === 'vps' || s.type === 'dedicated') && !placed.has(s.uuid),
  ).length;
  const nodesWithService = graph.nodes.filter((n) => n.service).length;

  return (
    <div className="w-60 rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-xs">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 text-ink-2"
        aria-expanded={open}
      >
        <span className="truncate">{stats?.name ?? t('topology.project')}</span>
        {open ? <IconChevronUp className="size-3.5" /> : <IconChevronDown className="size-3.5" />}
      </button>
      {open && stats && (
        <div className="mt-2 space-y-1">
          <p className="text-sm font-medium">
            {formatMoney(stats.monthlyTotal, stats.baseCurrency)}
            <span className="ml-1 text-xs font-normal text-ink-3">/ {t('topology.perMonth')}</span>
          </p>
          <p className="text-ink-2">
            {t('topology.servicesInProject', { count: stats.servicesCount })} ·{' '}
            {t('topology.onMap', { count: nodesWithService })}
          </p>
          {missing > 0 && (
            <div className="flex items-center justify-between gap-2 pt-1">
              <span className="text-warn">{t('topology.missingServices', { count: missing })}</span>
              {editable && (
                <Button size="sm" variant="ghost" onClick={onReview}>
                  {t('topology.review')}
                </Button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
