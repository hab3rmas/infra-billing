import type { Node, NodeProps } from '@xyflow/react';
import { useTranslation } from 'react-i18next';
import { CountryFlag } from '@/components/CountryFlag';
import { cn } from '@/lib/utils';
import type { TopoNodeData } from '../graph';

// Dashed container: one server holding several IPs or roles ("api-pl · Poland": IP A in, IP B out).
// Children are separate nodes laid out inside it; links attach to them, not to the container.
export function GroupNode({ data, selected }: NodeProps<Node<TopoNodeData>>) {
  const { t } = useTranslation();
  const n = data.node;
  return (
    <div
      className={cn(
        'h-full w-full rounded-2xl border border-dashed bg-card/40 transition-opacity',
        selected ? 'border-ring' : 'border-ink-3',
        data.dimmed && 'opacity-30',
      )}
    >
      <div className="flex items-center gap-1.5 px-4 pt-2.5 text-xs text-ink-2">
        {n.service && <CountryFlag code={n.service.countryCode} />}
        <span className="truncate font-medium">
          {n.label || n.service?.name || t('topology.group')}
        </span>
      </div>
    </div>
  );
}
