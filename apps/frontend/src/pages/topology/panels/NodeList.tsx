import type { TopologyGraph } from '@infra/shared';
import { useTranslation } from 'react-i18next';
import { CountryFlag } from '@/components/CountryFlag';
import { cn } from '@/lib/utils';
import { nodeCountry } from '../graph';
import { ROLES } from '../roles';

// Phone view: a canvas of 20 tiny cards is unreadable, a list with status is not.
export function NodeList({
  graph,
  onOpen,
}: {
  graph: TopologyGraph;
  onOpen: (uuid: string) => void;
}) {
  const { t } = useTranslation();
  const nodes = graph.nodes.filter((n) => !n.hidden && n.kind !== 'group');
  return (
    <ul className="divide-y divide-hairline rounded-xl border border-border bg-card">
      {nodes.map((n) => {
        const c = nodeCountry(n);
        const online = n.meta.online;
        const address = n.addresses[0]?.value ?? n.service?.ipCandidates[0];
        return (
          <li key={n.uuid}>
            <button
              type="button"
              onClick={() => onOpen(n.uuid)}
              className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left"
            >
              {c ? <CountryFlag code={c} className="text-base" /> : <span className="w-5" />}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">
                  {n.label || n.service?.name || t('topology.unnamed')}
                </span>
                <span className="block truncate text-xs text-ink-2">
                  {t(ROLES[n.role].labelKey)}
                  {address ? ` · ${address}` : ''}
                </span>
              </span>
              {online !== undefined && (
                <span
                  role="img"
                  aria-label={online ? t('topology.online') : t('topology.offline')}
                  className={cn(
                    'size-2 shrink-0 rounded-full',
                    online ? 'bg-ok' : 'bg-destructive',
                  )}
                />
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
