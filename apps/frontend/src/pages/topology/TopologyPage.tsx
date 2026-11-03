import type { TopologyMap } from '@infra/shared';
import {
  IconCopy,
  IconDownload,
  IconDots,
  IconLayoutDistributeHorizontal,
  IconPencil,
  IconPlus,
  IconRefresh,
  IconSitemap,
  IconTrash,
} from '@tabler/icons-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
import { apiErrorMessage } from '@/api/client';
import { useProjects } from '@/api/projects';
import {
  useDeleteMap,
  useDuplicateMap,
  useSeedMap,
  useTopologyGraph,
  useTopologyMaps,
} from '@/api/topology';
import { useRemnawaveIntegrations, useSyncRemnawave } from '@/api/remnawave';
import { Combobox } from '@/components/Combobox';
import { EntityLabel } from '@/components/EntityLabel';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { useIsMobile } from '@/hooks/use-mobile';
import { usePersistedState } from '@/hooks/usePersistedState';
import { cn } from '@/lib/utils';
import { notifyError, notifySuccess } from '@/utils/notify';
import { type CanvasControl, TopologyCanvas } from './TopologyCanvas';
import { AddNodeDialog } from './panels/AddNodeDialog';
import { LinkDialog, type LinkDialogState } from './panels/LinkDialog';
import { MapDialog } from './panels/MapDialog';
import { NodeSheet } from './panels/NodeSheet';
import { TabbyExportDialog } from './panels/TabbyExportDialog';

const SEGMENTED_MAX = 4;
const parseLast = (raw: unknown): { map?: string } | null =>
  raw && typeof raw === 'object' && typeof (raw as { map?: unknown }).map === 'string'
    ? { map: (raw as { map: string }).map }
    : null;

export function TopologyPage() {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const [params, setParams] = useSearchParams();
  const { data: maps, isLoading: mapsLoading } = useTopologyMaps();
  const { data: projects } = useProjects();
  const [last, setLast] = usePersistedState<{ map?: string }>('topology-map', parseLast, {});

  // Selected map: ?map=<uuid>, else the last opened one, else the first.
  const wanted = params.get('map') ?? last.map;
  const current = maps?.find((m) => m.uuid === wanted) ?? maps?.[0];
  const { data: graph, isLoading: graphLoading } = useTopologyGraph(current?.uuid);

  const select = (uuid: string) => {
    setParams({ map: uuid }, { replace: true });
    setLast({ map: uuid });
    setSelectedNode(null);
  };
  // Keep the address bar in step with the map actually shown.
  useEffect(() => {
    if (current && params.get('map') !== current.uuid) {
      setParams({ map: current.uuid }, { replace: true });
    }
  }, [current, params, setParams]);

  const del = useDeleteMap();
  const dup = useDuplicateMap();
  const seed = useSeedMap();
  const canvas = useRef<CanvasControl | null>(null);
  const [mapDialog, setMapDialog] = useState<{ editing: TopologyMap | null } | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [linkDialog, setLinkDialog] = useState<LinkDialogState | null>(null);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [showService, setShowService] = useState(true);
  const [tabbyOpen, setTabbyOpen] = useState(false);
  const { data: integrations } = useRemnawaveIntegrations();
  const rwSync = useSyncRemnawave();
  const mapIntegrations = (integrations ?? []).filter(
    (i) => i.mapUuid === current?.uuid && i.enabled,
  );
  const failed = mapIntegrations.find((i) => i.lastSyncError);

  const doRwSync = async () => {
    for (const i of mapIntegrations) {
      try {
        const r = await rwSync.mutateAsync(i.uuid);
        notifySuccess(
          t('remnawave.syncDone', {
            nodes: r.nodesCreated + r.nodesUpdated,
            links: r.linksCreated + r.linksUpdated,
            removed: r.linksRemoved + r.nodesHidden,
          }),
        );
      } catch (e) {
        notifyError(apiErrorMessage(e));
      }
    }
  };
  const [search, setSearch] = useState('');

  const doSeed = async () => {
    if (!current) return;
    try {
      const { created } = await seed.mutateAsync(current.uuid);
      notifySuccess(t('topology.seeded', { count: created }));
    } catch (e) {
      notifyError(apiErrorMessage(e));
    }
  };

  const doDelete = async (m: TopologyMap) => {
    if (!window.confirm(t('topology.confirmDeleteMap', { name: m.name }))) return;
    try {
      await del.mutateAsync(m.uuid);
      setParams({}, { replace: true });
      setLast({});
    } catch (e) {
      notifyError(apiErrorMessage(e));
    }
  };

  const doDuplicate = async (m: TopologyMap) => {
    try {
      select((await dup.mutateAsync(m.uuid)).uuid);
    } catch (e) {
      notifyError(apiErrorMessage(e));
    }
  };

  const projectOf = (m: TopologyMap) => projects?.find((p) => p.uuid === m.projectUuid);
  const mapLabel = (m: TopologyMap) => {
    const p = projectOf(m);
    return p ? (
      <EntityLabel
        name={m.name}
        src={p.faviconLink}
        iconName={p.iconName}
        iconBg={p.iconBg}
        size={18}
      />
    ) : (
      m.name
    );
  };

  const switcher =
    maps && maps.length > 0 ? (
      <div className="flex items-center gap-2">
        {maps.length <= SEGMENTED_MAX ? (
          <div role="tablist" className="flex items-center gap-1 rounded-lg bg-secondary p-0.5">
            {maps.map((m) => (
              <button
                key={m.uuid}
                type="button"
                role="tab"
                aria-selected={m.uuid === current?.uuid}
                onClick={() => select(m.uuid)}
                className={cn(
                  'rounded-md px-2.5 py-1 text-sm text-ink-2 transition-colors',
                  m.uuid === current?.uuid && 'bg-card font-medium text-foreground shadow-xs',
                )}
              >
                {mapLabel(m)}
              </button>
            ))}
          </div>
        ) : (
          <div className="w-56">
            <Combobox
              value={current?.uuid ?? ''}
              onChange={select}
              options={maps.map((m) => ({ value: m.uuid, label: m.name }))}
            />
          </div>
        )}
        {!isMobile && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon" variant="ghost" aria-label={t('topology.mapMenu')}>
                <IconDots className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setMapDialog({ editing: null })}>
                <IconPlus className="size-4" />
                {t('topology.newMap')}
              </DropdownMenuItem>
              {current && (
                <>
                  <DropdownMenuItem onSelect={() => setMapDialog({ editing: current })}>
                    <IconPencil className="size-4" />
                    {t('topology.editMap')}
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => doDuplicate(current)}>
                    <IconCopy className="size-4" />
                    {t('topology.duplicate')}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onSelect={() => doDelete(current)}>
                    <IconTrash className="size-4" />
                    {t('common.delete')}
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    ) : null;

  const actions = current && !isMobile && (
    <>
      <Button size="sm" variant="ghost" onClick={() => canvas.current?.autoLayout()}>
        <IconLayoutDistributeHorizontal className="size-4" />
        {t('topology.autoLayout')}
      </Button>
      {mapIntegrations.length > 0 && (
        <Button size="sm" variant="ghost" onClick={doRwSync} disabled={rwSync.isPending}>
          <IconRefresh className={cn('size-4', rwSync.isPending && 'animate-spin')} />
          {t('remnawave.syncShort')}
        </Button>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="ghost">
            <IconDownload className="size-4" />
            {t('topology.export')}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => canvas.current?.exportImage('png')}>
            PNG
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => canvas.current?.exportImage('svg')}>
            SVG
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setTabbyOpen(true)}>
            {t('tabby.exportMenu')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Button size="sm" onClick={() => setAddOpen(true)}>
        <IconPlus className="size-4" />
        {t('topology.addNode')}
      </Button>
    </>
  );

  const header = (
    <PageHeader title={t('topology.title')} controls={switcher} actions={actions || undefined} />
  );

  if (mapsLoading) {
    return (
      <>
        {header}
        <Skeleton className="h-[calc(100dvh-8rem)] w-full rounded-xl" />
      </>
    );
  }

  // No maps yet: offer to create the first one.
  if (!maps || maps.length === 0) {
    const withServers = projects ?? [];
    return (
      <>
        {header}
        <div className="mx-auto mt-16 max-w-md space-y-4 text-center">
          <IconSitemap aria-hidden stroke={1.25} className="mx-auto size-10 text-ink-3" />
          <p className="text-base font-medium">{t('topology.emptyTitle')}</p>
          <p className="text-sm text-ink-2">{t('topology.emptyHint')}</p>
          {!isMobile && (
            <Button onClick={() => setMapDialog({ editing: null })}>
              <IconPlus className="size-4" />
              {t('topology.createMap')}
            </Button>
          )}
          {withServers.length > 1 && (
            <p className="text-xs text-ink-3">{t('topology.perProjectHint')}</p>
          )}
        </div>
        <MapDialog
          open={mapDialog !== null}
          onOpenChange={(o) => !o && setMapDialog(null)}
          editing={null}
          onSaved={(m) => select(m.uuid)}
        />
      </>
    );
  }

  const visibleNodes = graph?.nodes.filter((n) => !n.hidden) ?? [];

  return (
    <>
      {header}
      {failed && (
        <Alert variant="destructive" className="mb-3">
          <AlertDescription>
            {t('remnawave.syncFailed', { name: failed.name })}: {failed.lastSyncError}
          </AlertDescription>
        </Alert>
      )}
      <div className="relative h-[calc(100dvh-8rem)] min-h-96 overflow-hidden rounded-xl border border-border">
        {graphLoading || !graph ? (
          <Skeleton className="size-full" />
        ) : (
          <>
            <div className="absolute top-3 right-3 z-10 hidden items-center gap-2 md:flex">
              {graph && graph.nodes.length > 0 && (
                <div className="w-48">
                  <Combobox
                    value={search}
                    onChange={(uuid) => {
                      setSearch('');
                      if (uuid) canvas.current?.focusNode(uuid);
                    }}
                    placeholder={t('topology.searchNode')}
                    options={graph.nodes
                      .filter((n) => !n.hidden)
                      .map((n) => ({
                        value: n.uuid,
                        label: n.label || n.service?.name || t('topology.unnamed'),
                        keywords: [
                          ...n.addresses.map((a) => a.value),
                          n.service?.name ?? '',
                          n.sshHost ?? '',
                        ],
                      }))}
                  />
                </div>
              )}
              <Button
                size="sm"
                variant="outline"
                className="bg-card"
                onClick={() => setShowService((v) => !v)}
              >
                {showService ? t('topology.hideService') : t('topology.showService')}
              </Button>
            </div>
            <TopologyCanvas
              graph={graph}
              showService={showService}
              controlRef={canvas}
              onOpenNode={setSelectedNode}
              onLink={setLinkDialog}
              onSeed={doSeed}
              seeding={seed.isPending}
            />
            {visibleNodes.length === 0 && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="pointer-events-auto max-w-sm space-y-3 rounded-xl border border-border bg-card p-5 text-center shadow-xs">
                  <p className="text-sm font-medium">{t('topology.mapEmptyTitle')}</p>
                  <p className="text-xs text-ink-2">{t('topology.mapEmptyHint')}</p>
                  {!isMobile && (
                    <div className="flex flex-wrap justify-center gap-2">
                      {current?.projectUuid && (
                        <Button size="sm" onClick={doSeed} disabled={seed.isPending}>
                          {t('topology.seedServers')}
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => setAddOpen(true)}>
                        {t('topology.addNode')}
                      </Button>
                      <Button size="sm" variant="ghost" asChild>
                        <Link to={`/settings/topology?map=${current?.uuid}`}>
                          {t('remnawave.connectToMap')}
                        </Link>
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {graph && (
        <>
          <NodeSheet
            graph={graph}
            nodeUuid={selectedNode}
            onClose={() => setSelectedNode(null)}
            onSelectNode={setSelectedNode}
            editable={!isMobile}
          />
          <AddNodeDialog open={addOpen} onOpenChange={setAddOpen} map={graph.map} />
          <TabbyExportDialog open={tabbyOpen} onOpenChange={setTabbyOpen} />
          <LinkDialog state={linkDialog} onClose={() => setLinkDialog(null)} map={graph.map} />
        </>
      )}
      <MapDialog
        open={mapDialog !== null}
        onOpenChange={(o) => !o && setMapDialog(null)}
        editing={mapDialog?.editing ?? null}
        onSaved={(m) => select(m.uuid)}
      />
    </>
  );
}
