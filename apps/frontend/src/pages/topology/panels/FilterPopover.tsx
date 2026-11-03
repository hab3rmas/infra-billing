import type { TopologyGraph } from '@infra/shared';
import { IconFilter } from '@tabler/icons-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { CountryFlag } from '@/components/CountryFlag';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { type MapFilter, nodeCountry } from '../graph';

export const NO_FILTER: MapFilter = { countries: [], onlineOnly: false };

// One small button over the canvas: show only some countries or only online servers. It stays
// out of the way (a count badge when active) so the map itself is not crowded.
export function FilterPopover({
  graph,
  value,
  onChange,
}: {
  graph: TopologyGraph;
  value: MapFilter;
  onChange: (f: MapFilter) => void;
}) {
  const { t } = useTranslation();
  const countries = useMemo(
    () =>
      [
        ...new Set(
          graph.nodes
            .filter((n) => !n.hidden && n.kind !== 'group')
            .map(nodeCountry)
            .filter((c): c is string => !!c && c !== 'XX'),
        ),
      ].sort(),
    [graph.nodes],
  );
  const hasOnline = graph.nodes.some((n) => n.meta.online !== undefined);
  const active = value.countries.length + (value.onlineOnly ? 1 : 0);
  if (countries.length < 2 && !hasOnline) return null;

  const toggle = (c: string) =>
    onChange({
      ...value,
      countries: value.countries.includes(c)
        ? value.countries.filter((x) => x !== c)
        : [...value.countries, c],
    });

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline" className="bg-card">
          <IconFilter className="size-4" />
          {t('topology.filter')}
          {active > 0 && (
            <span className="rounded-full bg-sidebar-accent px-1.5 text-[11px] text-slate">
              {active}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 space-y-3">
        {countries.length > 1 && (
          <div className="space-y-1.5">
            <p className="text-xs text-ink-2">{t('topology.filterCountries')}</p>
            <div className="flex flex-wrap gap-1.5">
              {countries.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => toggle(c)}
                  aria-pressed={value.countries.includes(c)}
                  className={cn(
                    'inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-1 text-xs hover:bg-accent',
                    value.countries.includes(c) && 'ring-1 ring-slate',
                  )}
                >
                  <CountryFlag code={c} />
                  {c}
                </button>
              ))}
            </div>
          </div>
        )}
        {hasOnline && (
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="flt-online" className="font-normal">
              {t('topology.filterOnline')}
            </Label>
            <Switch
              id="flt-online"
              checked={value.onlineOnly}
              onCheckedChange={(on) => onChange({ ...value, onlineOnly: on })}
            />
          </div>
        )}
        {active > 0 && (
          <Button size="sm" variant="ghost" className="w-full" onClick={() => onChange(NO_FILTER)}>
            {t('topology.filterReset')}
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}
