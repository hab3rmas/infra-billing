import type { TopologyMap, TopologyNodeRole } from '@infra/shared';
import { TOPOLOGY_NODE_ROLES } from '@infra/shared';
import { IconLoader2 } from '@tabler/icons-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiErrorMessage } from '@/api/client';
import { useServices } from '@/api/services';
import { useCreateNode } from '@/api/topology';
import { Combobox } from '@/components/Combobox';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { notifyError, notifySuccess } from '@/utils/notify';
import { ROLES, type NodeTemplate, templatesFor } from '../roles';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  map: TopologyMap;
}

// "Add node": quick templates for the map's preset, then a billing service (servers of the map's
// project first) or a free-form external endpoint.
export function AddNodeDialog({ open, onOpenChange, map }: Props) {
  const { t } = useTranslation();
  const create = useCreateNode(map.uuid);
  const [role, setRole] = useState<TopologyNodeRole>('other');
  const [external, setExternal] = useState(false);
  const [group, setGroup] = useState(false);
  const [label, setLabel] = useState('');
  const [serviceUuid, setServiceUuid] = useState('');
  const [address, setAddress] = useState('');
  const [allProjects, setAllProjects] = useState(false);
  const { data: services } = useServices(
    allProjects || !map.projectUuid ? {} : { projectUuid: map.projectUuid },
    { enabled: open && !external },
  );

  const pickTemplate = (tpl: NodeTemplate) => {
    setRole(tpl.role);
    setExternal(tpl.external);
    setGroup(false);
    setLabel(tpl.labelKey ? t(tpl.labelKey) : '');
  };

  const submit = async () => {
    try {
      await create.mutateAsync({
        mapUuid: map.uuid,
        // A server without a billing service (free VPS, panel…) is stored as external.
        kind: group ? 'group' : serviceUuid && !external ? 'service' : 'external',
        role,
        label: label.trim() || null,
        ...(serviceUuid && !external ? { serviceUuid } : {}),
        ...(address.trim()
          ? { addresses: [{ value: address.trim(), direction: 'both' as const }] }
          : {}),
      });
      notifySuccess(t('topology.nodeAdded'));
      onOpenChange(false);
      setLabel('');
      setServiceUuid('');
      setAddress('');
    } catch (e) {
      notifyError(apiErrorMessage(e));
    }
  };

  const needsLabel = group || external || !serviceUuid;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{t('topology.addNode')}</DialogTitle>
        </DialogHeader>
        <div className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
          <div className="flex flex-wrap gap-1.5">
            {templatesFor(map.preset).map((tpl) => {
              const Icon = ROLES[tpl.role].icon;
              const name = tpl.labelKey ? t(tpl.labelKey) : t(ROLES[tpl.role].labelKey);
              return (
                <button
                  key={`${tpl.role}-${tpl.labelKey ?? ''}`}
                  type="button"
                  onClick={() => pickTemplate(tpl)}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-lg bg-secondary px-2.5 py-1 text-xs text-foreground hover:bg-accent',
                    role === tpl.role &&
                      label === (tpl.labelKey ? t(tpl.labelKey) : '') &&
                      'ring-1 ring-ring',
                  )}
                >
                  <Icon aria-hidden className="size-3.5 text-ink-3" />
                  {name}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="node-external"
              checked={external}
              onCheckedChange={(v) => setExternal(v === true)}
            />
            <Label htmlFor="node-external" className="font-normal">
              {t('topology.externalNode')}
            </Label>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="node-group"
              checked={group}
              onCheckedChange={(v) => setGroup(v === true)}
            />
            <Label htmlFor="node-group" className="font-normal">
              {t('topology.groupNode')}
            </Label>
          </div>

          {!external && (
            <div className="space-y-2">
              <Label>{t('topology.billingService')}</Label>
              <Combobox
                value={serviceUuid}
                onChange={setServiceUuid}
                placeholder={t('topology.noService')}
                options={[
                  { value: '', label: t('topology.noService') },
                  ...(services ?? []).map((s) => ({
                    value: s.uuid,
                    label: s.name,
                    keywords: [s.type],
                  })),
                ]}
              />
              {map.projectUuid && (
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="node-all-projects"
                    checked={allProjects}
                    onCheckedChange={(v) => setAllProjects(v === true)}
                  />
                  <Label htmlFor="node-all-projects" className="font-normal">
                    {t('topology.allProjects')}
                  </Label>
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="node-label">{t('topology.label')}</Label>
              <Input id="node-label" value={label} onChange={(e) => setLabel(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>{t('topology.role.title')}</Label>
              <Combobox
                value={role}
                onChange={(v) => setRole(v as TopologyNodeRole)}
                options={TOPOLOGY_NODE_ROLES.map((r) => ({
                  value: r,
                  label: t(ROLES[r].labelKey),
                }))}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="node-address">{t('topology.address')}</Label>
            <Input
              id="node-address"
              className="font-mono"
              placeholder="203.0.113.10"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
          </div>
          <Button
            className="w-full"
            onClick={submit}
            disabled={create.isPending || (needsLabel && !label.trim() && !serviceUuid)}
          >
            {create.isPending && <IconLoader2 className="size-4 animate-spin" />}
            {t('common.add')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
