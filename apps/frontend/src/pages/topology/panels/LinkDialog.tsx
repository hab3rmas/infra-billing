import type { TopologyLink, TopologyLinkKind, TopologyMap } from '@infra/shared';
import { TOPOLOGY_LINK_KINDS } from '@infra/shared';
import { IconLoader2 } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiErrorMessage } from '@/api/client';
import { useCreateLink, useDeleteLink, useUpdateLink } from '@/api/topology';
import { Combobox } from '@/components/Combobox';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { notifyError, notifySuccess } from '@/utils/notify';
import { DEFAULT_LINK_KIND, EDGE_STYLES, KINDS_BY_PRESET } from '../edgeStyles';

export type LinkDialogState =
  | { mode: 'create'; fromUuid: string; toUuid: string }
  | { mode: 'edit'; link: TopologyLink };

interface Props {
  state: LinkDialogState | null;
  onClose: () => void;
  map: TopologyMap;
}

// Create (after dragging between two handles) or edit a link: kind, label, route, protocol,
// animation. The preset decides which kinds come first and the default one.
export function LinkDialog({ state, onClose, map }: Props) {
  const { t } = useTranslation();
  const create = useCreateLink(map.uuid);
  const update = useUpdateLink(map.uuid);
  const del = useDeleteLink(map.uuid);
  const [kind, setKind] = useState<TopologyLinkKind>('chain');
  const [label, setLabel] = useState('');
  const [route, setRoute] = useState('');
  const [protocol, setProtocol] = useState('');
  const [animated, setAnimated] = useState(true);

  useEffect(() => {
    if (!state) return;
    if (state.mode === 'edit') {
      const l = state.link;
      setKind(l.kind);
      setLabel(l.label ?? '');
      setRoute(l.route?.toString() ?? '');
      setProtocol(l.protocol ?? '');
      setAnimated(l.animated);
    } else {
      setKind(DEFAULT_LINK_KIND[map.preset]);
      setLabel('');
      setRoute('');
      setProtocol('');
      setAnimated(true);
    }
  }, [state, map.preset]);

  if (!state) return null;
  const preferred = KINDS_BY_PRESET[map.preset];
  const kinds = [...preferred, ...TOPOLOGY_LINK_KINDS.filter((k) => !preferred.includes(k))];
  const pending = create.isPending || update.isPending;

  const submit = async () => {
    const routeNum = route.trim() === '' ? null : Number(route);
    if (routeNum !== null && (!Number.isInteger(routeNum) || routeNum < 0 || routeNum > 999)) {
      notifyError(t('topology.routeInvalid'));
      return;
    }
    const fields = {
      kind,
      label: label.trim() || null,
      route: routeNum,
      protocol: protocol.trim() || null,
      animated,
    };
    try {
      if (state.mode === 'create') {
        await create.mutateAsync({
          mapUuid: map.uuid,
          fromUuid: state.fromUuid,
          toUuid: state.toUuid,
          ...fields,
        });
      } else {
        await update.mutateAsync({ uuid: state.link.uuid, dto: fields });
      }
      notifySuccess(t('topology.linkSaved'));
      onClose();
    } catch (e) {
      notifyError(apiErrorMessage(e));
    }
  };

  const remove = async () => {
    if (state.mode !== 'edit') return;
    if (!window.confirm(t('topology.confirmDeleteLink'))) return;
    try {
      await del.mutateAsync(state.link.uuid);
      onClose();
    } catch (e) {
      notifyError(apiErrorMessage(e));
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {state.mode === 'create' ? t('topology.newLink') : t('topology.editLink')}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>{t('topology.linkKind')}</Label>
            <Combobox
              value={kind}
              onChange={(v) => setKind(v as TopologyLinkKind)}
              options={kinds.map((k) => ({ value: k, label: t(EDGE_STYLES[k].labelKey) }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="link-label">{t('topology.label')}</Label>
            <Input
              id="link-label"
              className="font-mono"
              placeholder="PL-OUT"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="link-route">{t('topology.route')}</Label>
              <Input
                id="link-route"
                inputMode="numeric"
                placeholder="2"
                value={route}
                onChange={(e) => setRoute(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="link-protocol">{t('topology.protocol')}</Label>
              <Input
                id="link-protocol"
                placeholder="vless-reality"
                value={protocol}
                onChange={(e) => setProtocol(e.target.value)}
              />
            </div>
          </div>
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="link-animated">{t('topology.animated')}</Label>
            <Switch id="link-animated" checked={animated} onCheckedChange={setAnimated} />
          </div>
          <div className="flex gap-2">
            <Button className="flex-1" onClick={submit} disabled={pending}>
              {pending && <IconLoader2 className="size-4 animate-spin" />}
              {t('common.save')}
            </Button>
            {state.mode === 'edit' && (
              <Button variant="ghost" onClick={remove}>
                {t('common.delete')}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
