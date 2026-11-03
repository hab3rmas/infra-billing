import type { ApplyAccountProjectsResult } from '@infra/shared';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiErrorMessage } from '@/api/client';
import { useProjects } from '@/api/projects';
import {
  useAccountProjects,
  useApplyAccountProjects,
  useSetAccountProject,
  useTopologySettings,
  useUpdateTopologySettings,
} from '@/api/topology';
import { Combobox } from '@/components/Combobox';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { TABBY_MIN_VERSION } from '@/lib/tabby';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { notifyError, notifySuccess } from '@/utils/notify';

// Default SSH user and port, saved on blur so typing does not fire a request per key.
function SshDefaults({
  user,
  port,
  onSave,
}: {
  user: string;
  port: number;
  onSave: (patch: { defaultSshUser?: string; defaultSshPort?: number }) => void;
}) {
  const { t } = useTranslation();
  const [u, setU] = useState(user);
  const [p, setP] = useState(String(port));
  const commit = () => {
    const portNum = Number(p);
    const valid = Number.isInteger(portNum) && portNum >= 1 && portNum <= 65535;
    if (!valid || !/^[a-z_][a-z0-9_.-]*$/i.test(u)) {
      notifyError(t('tabby.defaultsInvalid'));
      setU(user);
      setP(String(port));
      return;
    }
    if (u !== user || portNum !== port) onSave({ defaultSshUser: u, defaultSshPort: portNum });
  };
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="space-y-2">
        <Label htmlFor="ts-user">{t('tabby.defaultUser')}</Label>
        <Input id="ts-user" value={u} onChange={(e) => setU(e.target.value)} onBlur={commit} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="ts-port">{t('tabby.defaultPort')}</Label>
        <Input
          id="ts-port"
          inputMode="numeric"
          value={p}
          onChange={(e) => setP(e.target.value)}
          onBlur={commit}
        />
      </div>
    </div>
  );
}

export function TopologySettingsPage() {
  const { t } = useTranslation();
  const { data: rows } = useAccountProjects();
  const { data: projects } = useProjects();
  const { data: settings } = useTopologySettings();
  const setProject = useSetAccountProject();
  const apply = useApplyAccountProjects();
  const updateSettings = useUpdateTopologySettings();
  const [preview, setPreview] = useState<ApplyAccountProjectsResult | null>(null);

  const projectName = (uuid: string) => projects?.find((p) => p.uuid === uuid)?.name ?? uuid;

  const choose = async (accountUuid: string, projectUuid: string) => {
    try {
      await setProject.mutateAsync({ accountUuid, projectUuid: projectUuid || null });
    } catch (e) {
      notifyError(apiErrorMessage(e));
    }
  };

  // Dry run first: the owner sees exactly which services would move.
  const openPreview = async () => {
    try {
      setPreview(await apply.mutateAsync(true));
    } catch (e) {
      notifyError(apiErrorMessage(e));
    }
  };

  const confirmApply = async () => {
    try {
      const r = await apply.mutateAsync(false);
      setPreview(null);
      notifySuccess(t('topologySettings.applied', { count: r.moved }));
    } catch (e) {
      notifyError(apiErrorMessage(e));
    }
  };

  const toggle = (patch: Parameters<typeof updateSettings.mutate>[0]) =>
    updateSettings.mutate(patch, { onError: (e) => notifyError(apiErrorMessage(e)) });

  return (
    <div className="max-w-3xl space-y-10">
      <PageHeader title={t('topologySettings.title')} />

      <section className="space-y-4">
        <div>
          <h2 className="text-base font-medium">{t('topologySettings.accountsTitle')}</h2>
          <p className="mt-1 text-sm text-ink-2">{t('topologySettings.accountsHint')}</p>
        </div>
        <div className="divide-y divide-hairline rounded-xl border border-hairline">
          {(rows ?? []).map((r) => (
            <div key={r.accountUuid} className="flex items-center gap-3 px-4 py-2.5">
              <span className="min-w-0 flex-1 truncate text-sm">
                {r.providerName}
                {r.accountLabel && <span className="text-ink-2"> / {r.accountLabel}</span>}
              </span>
              <div className="w-56 shrink-0">
                <Combobox
                  value={r.projectUuid ?? ''}
                  onChange={(v) => choose(r.accountUuid, v)}
                  options={[
                    { value: '', label: t('topologySettings.noProject') },
                    ...(projects ?? []).map((p) => ({ value: p.uuid, label: p.name })),
                  ]}
                />
              </div>
            </div>
          ))}
          {rows?.length === 0 && (
            <p className="px-4 py-3 text-sm text-ink-2">{t('topologySettings.noAccounts')}</p>
          )}
        </div>
        <Button variant="ghost" onClick={openPreview} disabled={apply.isPending}>
          {t('topologySettings.applyExisting')}
        </Button>
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-base font-medium">{t('tabby.settingsTitle')}</h2>
          <p className="mt-1 text-sm text-ink-2">
            {t('tabby.settingsHint', { version: TABBY_MIN_VERSION })}
          </p>
        </div>
        {settings && (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="ts-tabby">{t('tabby.enable')}</Label>
              <Switch
                id="ts-tabby"
                checked={settings.tabbyEnabled}
                onCheckedChange={(on) => toggle({ tabbyEnabled: on })}
              />
            </div>
            <SshDefaults
              key={`${settings.defaultSshUser}:${settings.defaultSshPort}`}
              user={settings.defaultSshUser}
              port={settings.defaultSshPort}
              onSave={(patch) => toggle(patch)}
            />
          </div>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="text-base font-medium">{t('topologySettings.canvasTitle')}</h2>
        {settings && (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="ts-direction">{t('topologySettings.verticalLayout')}</Label>
              <Switch
                id="ts-direction"
                checked={settings.layoutDirection === 'DOWN'}
                onCheckedChange={(on) => toggle({ layoutDirection: on ? 'DOWN' : 'RIGHT' })}
              />
            </div>
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="ts-animate">{t('topologySettings.animate')}</Label>
              <Switch
                id="ts-animate"
                checked={settings.animateEdges}
                onCheckedChange={(on) => toggle({ animateEdges: on })}
              />
            </div>
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="ts-external">{t('topologySettings.showExternal')}</Label>
              <Switch
                id="ts-external"
                checked={settings.showExternal}
                onCheckedChange={(on) => toggle({ showExternal: on })}
              />
            </div>
          </div>
        )}
      </section>

      <Dialog open={preview !== null} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('topologySettings.previewTitle')}</DialogTitle>
          </DialogHeader>
          {preview && preview.moved === 0 ? (
            <p className="text-sm text-ink-2">{t('topologySettings.previewNothing')}</p>
          ) : (
            <ul className="max-h-72 space-y-1 overflow-y-auto text-sm">
              {preview?.services.map((s) => (
                <li key={s.serviceUuid} className="flex justify-between gap-3">
                  <span className="truncate">{s.serviceName}</span>
                  <span className="shrink-0 text-ink-2">→ {projectName(s.projectUuid)}</span>
                </li>
              ))}
            </ul>
          )}
          {preview && preview.moved > 0 && (
            <Button onClick={confirmApply} disabled={apply.isPending}>
              {t('topologySettings.applyN', { count: preview.moved })}
            </Button>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
