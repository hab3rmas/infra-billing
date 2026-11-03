import {
  BaseEdge,
  type Edge,
  EdgeLabelRenderer,
  type EdgeProps,
  getSmoothStepPath,
} from '@xyflow/react';
import { useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/lib/theme';
import { cn } from '@/lib/utils';
import { EDGE_STYLES, edgeColor } from '../edgeStyles';
import type { TopoEdgeData } from '../graph';

const REDUCED = '(prefers-reduced-motion: reduce)';
const subscribeMotion = (cb: () => void) => {
  const mq = window.matchMedia(REDUCED);
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
};
const prefersReducedMotion = () => window.matchMedia(REDUCED).matches;

const DOT_COUNT = 2;
const DOT_SECONDS = 4;
const DOT_PHASES = Array.from({ length: DOT_COUNT }, (_, i) => i);

// One path style for every edge (smooth step). Dots run along the path with a phase shift; they
// are off when animation is disabled globally or per link, and for reduced-motion users.
export function TrafficEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  selected,
}: EdgeProps<Edge<TopoEdgeData>>) {
  const { t } = useTranslation();
  const { resolved } = useTheme();
  const reduced = useSyncExternalStore(subscribeMotion, prefersReducedMotion);
  if (!data) return null;
  const { link } = data;
  const style = EDGE_STYLES[link.kind];
  const color = edgeColor(link.kind, resolved === 'dark');

  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 12,
  });
  const markerId = `arrow-${id}`;
  const matches = Array.isArray(link.meta.match) ? (link.meta.match as string[]) : [];
  const inbounds = Array.isArray(link.meta.inbounds) ? (link.meta.inbounds as string[]) : [];
  const tooltip = [
    t(style.labelKey),
    link.protocol,
    inbounds.length ? `inbounds: ${inbounds.join(', ')}` : null,
    matches.length ? `match: ${matches.join(', ')}` : null,
  ]
    .filter(Boolean)
    .join('\n');
  const showLabel = link.label || link.route != null;

  return (
    <g className={cn('transition-opacity', data.dimmed && 'opacity-[0.1]')}>
      <defs>
        <marker
          id={markerId}
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto-start-reverse"
        >
          <path d="M0 1 L9 5 L0 9 z" fill={color} />
        </marker>
      </defs>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={`url(#${markerId})`}
        style={{
          stroke: color,
          strokeWidth: selected
            ? style.width + 1
            : data.highlighted
              ? style.width + 1.5
              : style.width,
          strokeDasharray: style.dash,
          filter: data.highlighted ? `drop-shadow(0 0 3px ${color})` : undefined,
        }}
        interactionWidth={16}
      />
      {(data.animate || (data.highlighted && style.traffic)) &&
        !reduced &&
        DOT_PHASES.map((i) => (
          <circle key={`dot-${i}`} r={data.highlighted ? 4 : 3} fill={color} aria-hidden>
            <animateMotion
              dur={`${data.highlighted ? DOT_SECONDS / 2 : DOT_SECONDS}s`}
              repeatCount="indefinite"
              path={path}
              begin={`${-(DOT_SECONDS / DOT_COUNT) * i}s`}
            />
          </circle>
        ))}
      {showLabel && (
        <EdgeLabelRenderer>
          <div
            title={tooltip}
            className="nodrag nopan pointer-events-auto absolute flex -translate-x-1/2 -translate-y-1/2 items-center gap-1 rounded-md bg-card px-1.5 py-0.5 text-[10px] text-ink-2 shadow-xs"
            style={{ left: labelX, top: labelY }}
          >
            {link.route != null && (
              <span className="rounded bg-sidebar-accent px-1 text-slate">
                {t('topology.routeN', { n: link.route })}
              </span>
            )}
            {link.label && <span className="font-mono">{link.label}</span>}
          </div>
        </EdgeLabelRenderer>
      )}
    </g>
  );
}
