import type { TopologyPreset } from '@infra/shared';
import { IconChevronDown, IconChevronUp } from '@tabler/icons-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/lib/theme';
import { EDGE_STYLES, KINDS_BY_PRESET, edgeColor } from '../edgeStyles';

// Collapsible legend of link kinds. Each kind shows its own stroke pattern, so colour is never the
// only way to tell them apart.
export function Legend({ preset }: { preset: TopologyPreset }) {
  const { t } = useTranslation();
  const { resolved } = useTheme();
  // Collapsed on phones: the canvas needs the room.
  const [open, setOpen] = useState(() => !window.matchMedia('(max-width: 767px)').matches);
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-xs">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-6 text-ink-2"
        aria-expanded={open}
      >
        {t('topology.legend')}
        {open ? <IconChevronDown className="size-3.5" /> : <IconChevronUp className="size-3.5" />}
      </button>
      {open && (
        <ul className="mt-2 space-y-1.5">
          {KINDS_BY_PRESET[preset].map((kind) => (
            <li key={kind} className="flex items-center gap-2">
              <svg width="32" height="6" aria-hidden>
                <line
                  x1="0"
                  y1="3"
                  x2="32"
                  y2="3"
                  stroke={edgeColor(kind, resolved === 'dark')}
                  strokeWidth={EDGE_STYLES[kind].width}
                  strokeDasharray={EDGE_STYLES[kind].dash}
                />
              </svg>
              <span>{t(EDGE_STYLES[kind].labelKey)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
