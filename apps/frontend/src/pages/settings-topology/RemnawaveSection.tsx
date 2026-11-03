import type { RemnawaveIntegration } from '@infra/shared';
import {
  IconAlertTriangle,
  IconLoader2,
  IconPencil,
  IconPlus,
  IconRefresh,
  IconTrash,
} from '@tabler/icons-react';
import dayjs from 'dayjs';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { apiErrorMessage } from '@/api/client';
import {
  revealRemnawave,
  useCreateRemnawaveIntegration,
  useDeleteRemnawaveIntegration,
  useRemnawaveIntegrations,
  useSyncRemnawave,
  useTestRemnawave,
  useUpdateRemnawaveIntegration,
} from '@/api/remnawave';
import { useServices } from '@/api/services';
import { useTopologyMaps } from '@/api/topology';
import { Combobox } from '@/components/Combobox';
import { SecretInput } from '@/components/SecretInput';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { notifyError, notifySuccess } from '@/utils/notify';

interface Form {
  name: string;
  mapUuid: string;
  baseUrl: string;
  token: string;
  headers: string;
  clearHeaders: boolean;
  subscriptionUrl: string;
  panelServiceUuid: string;
  subServiceUuid: string;
  autoSync: boolean;
  enabled: boolean;
}

const EMPTY: Form = {
  name: '',
  mapUuid: '',
  baseUrl: '',
  token: '',
  headers: '',
  clearHeaders: false,
  subscriptionUrl: '',
  panelServiceUuid: '',
  subServiceUuid: '',
  autoSync: true,
  enabled: true,
};

const isHttp = (url: string) => /^http:\/\//i.test(url.trim());

// Remnawave integrations: one card per panel. Each imports into its own map; a token and extra
// headers (for a panel behind a reverse proxy) are stored encrypted and never shown again unless
// revealed by the owner.
export function RemnawaveSection({ preselectMap }: { preselectMap: string | null }) {
  const { t } = useTranslation();
  const { data: integrations } = useRemnawaveIntegrations();
  const { data: maps } = useTopologyMaps();
  const { data: services } = useServices({});
  const create = useCreateRemnawaveIntegration();
  const update = useUpdateRemnawaveIntegration();
  const del = useDeleteRemnawaveIntegration();
  const test = useTestRemnawave();
  const sync = useSyncRemnawave();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<RemnawaveIntegration | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const patch = (p: Partial<Form>) => setForm((f) => ({ ...f, ...p }));

  const openCreate = useCallback((mapUuid = '') => {
    setEditing(null);
    setForm({ ...EMPTY, mapUuid });
    setOpen(true);
  }, []);

  const openEdit = (i: RemnawaveIntegration) => {
    setEditing(i);
    setForm({
      ...EMPTY,
      name: i.name,
      mapUuid: i.mapUuid,
      baseUrl: i.baseUrl,
      subscriptionUrl: i.subscriptionUrl ?? '',
      panelServiceUuid: i.panelServiceUuid ?? '',
      subServiceUuid: i.subServiceUuid ?? '',
      autoSync: i.autoSync,
      enabled: i.enabled,
    });
    setOpen(true);
  };

  // Coming from the empty map card ("Connect Remnawave"): open the form with that map selected.
  const handled = useRef<string | null>(null);
  useEffect(() => {
    if (preselectMap && maps && handled.current !== preselectMap) {
      handled.current = preselectMap;
      openCreate(preselectMap);
    }
  }, [preselectMap, maps, openCreate]);

  const parseHeaders = (): Record<string, string> | undefined | 'invalid' => {
    if (!form.headers.trim()) return undefined;
    try {
      const v = JSON.parse(form.headers);
      if (!v || typeof v !== 'object' || Array.isArray(v)) return 'invalid';
      return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, String(x)]));
    } catch {
      return 'invalid';
    }
  };

  const submit = async () => {
    const headers = parseHeaders();
    if (headers === 'invalid') {
      notifyError(t('remnawave.headersInvalid'));
      return;
    }
    const common = {
      name: form.name.trim(),
      mapUuid: form.mapUuid,
      baseUrl: form.baseUrl.trim(),
      subscriptionUrl: form.subscriptionUrl.trim() || null,
      panelServiceUuid: form.panelServiceUuid || null,
      subServiceUuid: form.subServiceUuid || null,
      autoSync: form.autoSync,
      enabled: form.enabled,
    };
    try {
      if (editing) {
        await update.mutateAsync({
          uuid: editing.uuid,
          dto: {
            ...common,
            ...(form.token ? { token: form.token } : {}),
            ...(headers
              ? { extraHeaders: headers }
              : form.clearHeaders
                ? { extraHeaders: null }
                : {}),
          },
        });
      } else {
        await create.mutateAsync({
          ...common,
          token: form.token,
          ...(headers ? { extraHeaders: headers } : {}),
        });
      }
      setOpen(false);
      notifySuccess(t('remnawave.saved'));
    } catch (e) {
      notifyError(apiErrorMessage(e));
    }
  };

  const doTest = async (i: RemnawaveIntegration) => {
    try {
      const r = await test.mutateAsync(i.uuid);
      if (r.ok) {
        notifySuccess(t('remnawave.testOk', { version: r.version ?? '?', count: r.nodes }));
      } else notifyError(r.error ?? t('remnawave.testFailed'));
    } catch (e) {
      notifyError(apiErrorMessage(e));
    }
  };

  const doSync = async (i: RemnawaveIntegration) => {
    try {
      const r = await sync.mutateAsync(i.uuid);
      notifySuccess(
        t('remnawave.syncDone', {
          nodes: r.nodesCreated + r.nodesUpdated,
          links: r.linksCreated + r.linksUpdated,
          removed: r.linksRemoved + r.nodesHidden,
        }),
      );
      for (const w of r.warnings.slice(0, 3)) notifyError(w);
    } catch (e) {
      notifyError(apiErrorMessage(e));
    }
  };

  const doDelete = async (i: RemnawaveIntegration) => {
    if (!window.confirm(t('remnawave.confirmDelete', { name: i.name }))) return;
    const purge = window.confirm(t('remnawave.confirmPurge'));
    try {
      await del.mutateAsync({ uuid: i.uuid, purge });
      notifySuccess(t('common.deleted'));
    } catch (e) {
      notifyError(apiErrorMessage(e));
    }
  };

  const mapName = (uuid: string) => maps?.find((m) => m.uuid === uuid)?.name ?? '—';
  const serviceOptions = [
    { value: '', label: t('common.none') },
    ...(services ?? []).map((s) => ({ value: s.uuid, label: s.name, keywords: [s.type] })),
  ];
  const pending = create.isPending || update.isPending;
  const valid = form.name.trim() && form.mapUuid && form.baseUrl.trim() && (editing || form.token);

  return (
    <section className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-medium">{t('remnawave.title')}</h2>
          <p className="mt-1 text-sm text-ink-2">{t('remnawave.hint')}</p>
        </div>
        <Button size="sm" onClick={() => openCreate()} disabled={!maps?.length}>
          <IconPlus className="size-4" />
          {t('remnawave.add')}
        </Button>
      </div>
      {maps?.length === 0 && <p className="text-sm text-ink-2">{t('remnawave.needMap')}</p>}

      <div className="space-y-3">
        {(integrations ?? []).map((i) => (
          <div key={i.uuid} className="space-y-3 rounded-xl border border-hairline p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{i.name}</p>
                <p className="truncate font-mono text-xs text-ink-2">{i.baseUrl}</p>
              </div>
              <div className="flex shrink-0 gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => doTest(i)}
                  disabled={test.isPending}
                >
                  {t('remnawave.test')}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => doSync(i)}
                  disabled={sync.isPending}
                >
                  {sync.isPending && sync.variables === i.uuid ? (
                    <IconLoader2 className="size-4 animate-spin" />
                  ) : (
                    <IconRefresh className="size-4" />
                  )}
                  {t('remnawave.sync')}
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={t('common.edit')}
                  onClick={() => openEdit(i)}
                >
                  <IconPencil className="size-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={t('common.delete')}
                  onClick={() => doDelete(i)}
                >
                  <IconTrash className="size-4" />
                </Button>
              </div>
            </div>
            <p className="text-xs text-ink-2">
              {t('remnawave.targetMap')}:{' '}
              <Link to={`/topology?map=${i.mapUuid}`} className="text-slate underline">
                {mapName(i.mapUuid)}
              </Link>
              {' · '}
              {i.enabled
                ? i.autoSync
                  ? t('remnawave.autoOn')
                  : t('remnawave.autoOff')
                : t('remnawave.disabled')}
              {' · '}
              {i.lastSyncAt
                ? t('remnawave.lastSync', { when: dayjs(i.lastSyncAt).format('DD.MM.YYYY HH:mm') })
                : t('remnawave.neverSynced')}
            </p>
            {i.lastWarnings.length > 0 && (
              <details className="text-xs text-ink-2">
                <summary className="cursor-pointer">
                  {t('remnawave.warnings', { count: i.lastWarnings.length })}
                </summary>
                <ul className="mt-1 list-disc space-y-0.5 pl-4">
                  {i.lastWarnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </details>
            )}
            {i.lastSyncError && (
              <p className="flex items-start gap-1.5 text-xs text-destructive">
                <IconAlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                {i.lastSyncError}
              </p>
            )}
          </div>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{editing ? t('remnawave.edit') : t('remnawave.add')}</DialogTitle>
          </DialogHeader>
          <div className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="rw-name">{t('remnawave.name')}</Label>
                <Input
                  id="rw-name"
                  value={form.name}
                  onChange={(e) => patch({ name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>{t('remnawave.targetMap')}</Label>
                <Combobox
                  value={form.mapUuid}
                  onChange={(v) => patch({ mapUuid: v })}
                  options={(maps ?? []).map((m) => ({ value: m.uuid, label: m.name }))}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="rw-url">{t('remnawave.url')}</Label>
              <Input
                id="rw-url"
                className="font-mono"
                placeholder="https://panel.example.com"
                value={form.baseUrl}
                onChange={(e) => patch({ baseUrl: e.target.value })}
              />
              {isHttp(form.baseUrl) && (
                <p className="text-xs text-warn">{t('remnawave.httpWarning')}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="rw-token">{t('remnawave.token')}</Label>
              <SecretInput
                id="rw-token"
                value={form.token}
                onChange={(v) => patch({ token: v })}
                hasStored={editing?.tokenSet}
                onReveal={
                  editing
                    ? async () => (await revealRemnawave(editing.uuid)).token ?? ''
                    : undefined
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rw-headers">{t('remnawave.headers')}</Label>
              <SecretInput
                id="rw-headers"
                multiline
                placeholder='{"X-Secret": "…"}'
                value={form.headers}
                onChange={(v) => patch({ headers: v, clearHeaders: false })}
                hasStored={editing?.extraHeadersSet && !form.clearHeaders}
                onReveal={
                  editing
                    ? async () =>
                        JSON.stringify(
                          (await revealRemnawave(editing.uuid)).extraHeaders ?? {},
                          null,
                          2,
                        )
                    : undefined
                }
              />
              <p className="text-xs text-ink-2">{t('remnawave.headersHint')}</p>
              {editing?.extraHeadersSet && (
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="rw-clear"
                    checked={form.clearHeaders}
                    onCheckedChange={(v) => patch({ clearHeaders: v === true, headers: '' })}
                  />
                  <Label htmlFor="rw-clear" className="font-normal">
                    {t('remnawave.clearHeaders')}
                  </Label>
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="rw-sub">{t('remnawave.subUrl')}</Label>
              <Input
                id="rw-sub"
                className="font-mono"
                placeholder="https://sub.example.com"
                value={form.subscriptionUrl}
                onChange={(e) => patch({ subscriptionUrl: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>{t('remnawave.panelService')}</Label>
                <Combobox
                  value={form.panelServiceUuid}
                  onChange={(v) => patch({ panelServiceUuid: v })}
                  options={serviceOptions}
                />
              </div>
              <div className="space-y-2">
                <Label>{t('remnawave.subService')}</Label>
                <Combobox
                  value={form.subServiceUuid}
                  onChange={(v) => patch({ subServiceUuid: v })}
                  options={serviceOptions}
                />
              </div>
            </div>
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="rw-auto">{t('remnawave.autoSync')}</Label>
              <Switch
                id="rw-auto"
                checked={form.autoSync}
                onCheckedChange={(v) => patch({ autoSync: v })}
              />
            </div>
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="rw-enabled">{t('remnawave.enabled')}</Label>
              <Switch
                id="rw-enabled"
                checked={form.enabled}
                onCheckedChange={(v) => patch({ enabled: v })}
              />
            </div>
            <Button className="w-full" onClick={submit} disabled={pending || !valid}>
              {pending && <IconLoader2 className="size-4 animate-spin" />}
              {t('common.save')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
