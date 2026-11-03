import type { TopologyMap, TopologyPreset } from '@infra/shared';
import { TOPOLOGY_PRESETS } from '@infra/shared';
import { IconLoader2 } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiErrorMessage } from '@/api/client';
import { useProjects } from '@/api/projects';
import { useCreateMap, useUpdateMap } from '@/api/topology';
import { Combobox } from '@/components/Combobox';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { notifyError } from '@/utils/notify';

const NEW_PROJECT = '__new__';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null = create. */
  editing: TopologyMap | null;
  onSaved: (map: TopologyMap) => void;
}

// Create or edit a map: name, preset, and the project it belongs to (or a brand-new project).
export function MapDialog({ open, onOpenChange, editing, onSaved }: Props) {
  const { t } = useTranslation();
  const { data: projects } = useProjects();
  const create = useCreateMap();
  const update = useUpdateMap();
  const [name, setName] = useState('');
  const [preset, setPreset] = useState<TopologyPreset>('vpn');
  const [project, setProject] = useState('');
  const [newProject, setNewProject] = useState('');

  useEffect(() => {
    if (!open) return;
    setName(editing?.name ?? '');
    setPreset(editing?.preset ?? 'vpn');
    setProject(editing?.projectUuid ?? '');
    setNewProject('');
  }, [open, editing]);

  const submit = async () => {
    try {
      if (editing) {
        const saved = await update.mutateAsync({
          uuid: editing.uuid,
          dto: {
            name: name.trim(),
            preset,
            projectUuid: project && project !== NEW_PROJECT ? project : null,
          },
        });
        onSaved(saved);
      } else {
        const saved = await create.mutateAsync({
          name: name.trim(),
          preset,
          ...(project === NEW_PROJECT
            ? { createProject: { name: newProject.trim() || name.trim() } }
            : { projectUuid: project || null }),
        });
        onSaved(saved);
      }
      onOpenChange(false);
    } catch (e) {
      notifyError(apiErrorMessage(e));
    }
  };

  const pending = create.isPending || update.isPending;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? t('topology.editMap') : t('topology.newMap')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="map-name">{t('topology.mapName')}</Label>
            <Input
              id="map-name"
              autoFocus
              placeholder={t('topology.mapNamePlaceholder')}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>{t('topology.preset.title')}</Label>
            <Combobox
              value={preset}
              onChange={(v) => setPreset(v as TopologyPreset)}
              options={TOPOLOGY_PRESETS.map((p) => ({
                value: p,
                label: t(`topology.preset.${p}`),
              }))}
            />
            <p className="text-xs text-ink-2">{t('topology.preset.hint')}</p>
          </div>
          <div className="space-y-2">
            <Label>{t('topology.mapProject')}</Label>
            <Combobox
              value={project}
              onChange={setProject}
              options={[
                { value: '', label: t('topology.noProject') },
                ...(editing ? [] : [{ value: NEW_PROJECT, label: t('topology.newProject') }]),
                ...(projects ?? []).map((p) => ({ value: p.uuid, label: p.name })),
              ]}
            />
            {project === NEW_PROJECT && (
              <Input
                aria-label={t('topology.newProjectName')}
                placeholder={t('topology.newProjectName')}
                value={newProject}
                onChange={(e) => setNewProject(e.target.value)}
              />
            )}
          </div>
          <Button className="w-full" onClick={submit} disabled={pending || !name.trim()}>
            {pending && <IconLoader2 className="size-4 animate-spin" />}
            {t('common.save')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
