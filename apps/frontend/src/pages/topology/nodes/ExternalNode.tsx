import { Handle, type Node, type NodeProps, Position } from '@xyflow/react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import type { TopoNodeData } from '../graph';
import { ROLES } from '../roles';

// Compact gray pill: clients, internet, WARP, RU sites, anything outside the owned servers.
export function ExternalNode({ data, selected }: NodeProps<Node<TopoNodeData>>) {
  const { t } = useTranslation();
  const n = data.node;
  const Icon = ROLES[n.role].icon;
  const [target, source] = data.vertical
    ? [Position.Top, Position.Bottom]
    : [Position.Left, Position.Right];
  return (
    <div
      className={cn(
        'flex h-10 items-center gap-2 rounded-full border bg-secondary px-4 text-sm text-ink-2 transition-opacity',
        selected ? 'border-ring' : 'border-transparent',
        data.highlighted && 'border-slate bg-card ring-2 ring-slate/30',
        data.dimmed && 'opacity-[0.18]',
      )}
    >
      <Handle type="target" position={target} className="topology-handle" />
      <Icon aria-hidden stroke={1.5} className="size-4 shrink-0" />
      <span className="max-w-40 truncate">{n.label || t(ROLES[n.role].labelKey)}</span>
      <Handle type="source" position={source} className="topology-handle" />
    </div>
  );
}
