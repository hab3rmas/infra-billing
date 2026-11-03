import type { TopologyGraph, TopologyNode, TopologyNodeRole } from '@infra/shared';
import { TOPOLOGY_NODE_ROLES } from '@infra/shared';
import { IconCopy, IconPlus, IconTrash } from '@tabler/icons-react';
import dayjs from 'dayjs';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { apiErrorMessage } from '@/api/client';
import { useServices } from '@/api/services';
import { useDeleteNode, useUpdateNode } from '@/api/topology';
import { Combobox } from '@/components/Combobox';
import { TabbyLinkButton } from '@/components/fork/OpenInTabbyButton';
import { resolveTabbyTarget } from '@/lib/tabby';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { formatMoney } from '@/utils/format';
import { notifyError, notifySuccess } from '@/utils/notify';
import { EDGE_STYLES } from '../edgeStyles';
import { nodeCountry } from '../graph';
import { ROLES } from '../roles';

interface Props {
  graph: TopologyGraph;
  nodeUuid: string | null;
  onClose: () => void;
  onSelectNode: (uuid: string) => void;
  editable: boolean;
}

type Addr = TopologyNode['addresses'][number];

// Right-hand panel of a node: billing service, addresses, role, group and its links. SSH / Tabby
// fields arrive with the Tabby stage.
export function NodeSheet({ graph, nodeUuid, onClose, onSelectNode, editable }: Props) {
  const { t } = useTranslation();
  const node = graph.nodes.find((n) => n.uuid === nodeUuid) ?? null;
  const mapUuid = graph.map.uuid;
  const update = useUpdateNode(mapUuid);
  const { data: services } = useServices({});
  const del = useDeleteNode(mapUuid);
  const [label, setLabel] = useState('');
  const [role, setRole] = useState<TopologyNodeRole>('other');
  const [parentUuid, setParentUuid] = useState('');
  const [serviceUuid, setServiceUuid] = useState('');
  const [addresses, setAddresses] = useState<Addr[]>([]);
  const [sshHost, setSshHost] = useState('');
  const [sshPort, setSshPort] = useState('');
  const [sshUser, setSshUser] = useState('');
  const [tabbyProfile, setTabbyProfile] = useState('');

  useEffect(() => {
    if (!node) return;
    setLabel(node.label ?? '');
    setRole(node.role);
    setParentUuid(node.parentUuid ?? '');
    setServiceUuid(node.serviceUuid ?? '');
    setAddresses(node.addresses);
    setSshHost(node.sshHost ?? '');
    setSshPort(node.sshPort?.toString() ?? '');
    setSshUser(node.sshUser ?? '');
    setTabbyProfile(node.tabbyProfile ?? '');
  }, [node]);

  // Services of the map's project first, then the rest; ones in the node's country on top, and
  // the ones already on another node of this map are marked, so a free server is easy to spot.
  const taken = new Set(
    graph.nodes.filter((n) => n.uuid !== nodeUuid && n.serviceUuid).map((n) => n.serviceUuid),
  );
  const country = node ? nodeCountry(node) : null;
  const serviceOptions = (services ?? [])
    .map((s) => ({
      value: s.uuid,
      label: s.name,
      group:
        s.projectUuid === graph.map.projectUuid
          ? t('topology.thisProject')
          : t('topology.otherProjects'),
      hint: taken.has(s.uuid) ? t('topology.onMapAlready') : (s.countryCode ?? undefined),
      keywords: [s.type, s.countryCode ?? ''],
      rank: (s.countryCode && s.countryCode === country ? 0 : 1) + (taken.has(s.uuid) ? 2 : 0),
    }))
    .sort((a, b) => a.rank - b.rank)
    .map(({ rank: _rank, ...o }) => o);

  if (!node) return <Sheet open={false} />;
  const svc = node.service;
  const nameOf = (uuid: string) => {
    const n = graph.nodes.find((x) => x.uuid === uuid);
    return n?.label || n?.service?.name || t('topology.unnamed');
  };
  const links = graph.links.filter((l) => l.fromUuid === node.uuid || l.toUuid === node.uuid);
  const groups = graph.nodes.filter((n) => n.kind === 'group' && n.uuid !== node.uuid);

  // What the buttons would open, from the unsaved form values.
  const preview = resolveTabbyTarget(
    {
      ...node,
      sshHost: sshHost.trim() || null,
      sshPort: Number(sshPort) || null,
      sshUser: sshUser.trim() || null,
      tabbyProfile: tabbyProfile.trim() || null,
      addresses,
    },
    graph.settings,
  );

  const save = async () => {
    const port = sshPort.trim() === '' ? null : Number(sshPort);
    if (port !== null && (!Number.isInteger(port) || port < 1 || port > 65535)) {
      notifyError(t('tabby.portInvalid'));
      return;
    }
    try {
      await update.mutateAsync({
        uuid: node.uuid,
        dto: {
          label: label.trim() || null,
          role,
          parentUuid: parentUuid || null,
          serviceUuid: serviceUuid || null,
          addresses: addresses.filter((a) => a.value.trim()),
          sshHost: sshHost.trim() || null,
          sshPort: port,
          sshUser: sshUser.trim() || null,
          tabbyProfile: tabbyProfile.trim() || null,
        },
      });
      notifySuccess(t('topology.nodeSaved'));
    } catch (e) {
      notifyError(apiErrorMessage(e));
    }
  };

  const remove = async () => {
    const key =
      node.source === 'remnawave' ? 'topology.confirmHideNode' : 'topology.confirmDeleteNode';
    if (!window.confirm(t(key))) return;
    try {
      await del.mutateAsync(node.uuid);
      onClose();
    } catch (e) {
      notifyError(apiErrorMessage(e));
    }
  };

  const setAddr = (i: number, patch: Partial<Addr>) =>
    setAddresses((list) => list.map((a, j) => (j === i ? { ...a, ...patch } : a)));

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{node.label || svc?.name || t('topology.unnamed')}</SheetTitle>
          <SheetDescription>{t(ROLES[node.role].labelKey)}</SheetDescription>
        </SheetHeader>
        <div className="space-y-5 px-4 pb-6">
          {svc && (
            <section className="space-y-1 rounded-lg bg-secondary p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{svc.name}</span>
                <Link
                  to={`/services?selected=${svc.uuid}`}
                  className="text-xs text-slate underline"
                >
                  {t('topology.openService')}
                </Link>
              </div>
              <p className="text-xs text-ink-2">
                {svc.providerName}
                {svc.accountLabel ? ` · ${svc.accountLabel}` : ''}
              </p>
              <p className="text-xs text-ink-2">
                {formatMoney(svc.cost, svc.currency)} /{' '}
                {t(`enums.period.${svc.period}`, svc.period)}
                {svc.nextBillingAt
                  ? ` · ${t('topology.nextCharge')} ${dayjs(svc.nextBillingAt).format('DD.MM.YYYY')}`
                  : ''}
              </p>
            </section>
          )}

          {node.source === 'remnawave' && (
            <p className="text-xs text-ink-2">{t('topology.importedNode')}</p>
          )}

          <div className="space-y-2">
            <Label htmlFor="ns-label">{t('topology.label')}</Label>
            <Input
              id="ns-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              disabled={!editable}
            />
          </div>
          <div className="space-y-2">
            <Label>{t('topology.billingService')}</Label>
            <Combobox
              value={serviceUuid}
              onChange={setServiceUuid}
              disabled={!editable}
              placeholder={t('topology.noService')}
              options={[{ value: '', label: t('topology.noService') }, ...serviceOptions]}
            />
            <p className="text-xs text-ink-2">{t('topology.serviceLinkHint')}</p>
          </div>
          <div className="space-y-2">
            <Label>{t('topology.role.title')}</Label>
            <Combobox
              value={role}
              onChange={(v) => setRole(v as TopologyNodeRole)}
              disabled={!editable}
              options={TOPOLOGY_NODE_ROLES.map((r) => ({ value: r, label: t(ROLES[r].labelKey) }))}
            />
          </div>
          {groups.length > 0 && (
            <div className="space-y-2">
              <Label>{t('topology.parentGroup')}</Label>
              <Combobox
                value={parentUuid}
                onChange={setParentUuid}
                disabled={!editable}
                options={[
                  { value: '', label: t('common.none') },
                  ...groups.map((g) => ({ value: g.uuid, label: nameOf(g.uuid) })),
                ]}
              />
            </div>
          )}

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>{t('topology.addresses')}</Label>
              {editable && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setAddresses((l) => [...l, { value: '', direction: 'both' }])}
                >
                  <IconPlus className="size-4" />
                </Button>
              )}
            </div>
            {addresses.map((a, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: rows have no stable id while editing
              <div key={i} className="flex gap-2">
                <Input
                  className="font-mono"
                  aria-label={t('topology.address')}
                  value={a.value}
                  disabled={!editable}
                  onChange={(e) => setAddr(i, { value: e.target.value })}
                />
                <div className="w-28 shrink-0">
                  <Combobox
                    value={a.direction}
                    disabled={!editable}
                    onChange={(v) => setAddr(i, { direction: v as Addr['direction'] })}
                    options={[
                      { value: 'in', label: t('topology.dirIn') },
                      { value: 'out', label: t('topology.dirOut') },
                      { value: 'both', label: t('topology.dirBoth') },
                    ]}
                  />
                </div>
                {editable && (
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={t('common.delete')}
                    onClick={() => setAddresses((l) => l.filter((_, j) => j !== i))}
                  >
                    <IconTrash className="size-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>

          <div className="space-y-2">
            <Label>{t('tabby.ssh')}</Label>
            <div className="grid grid-cols-[1fr_5rem_8rem] gap-2">
              <Input
                className="font-mono"
                aria-label={t('tabby.host')}
                placeholder={t('tabby.host')}
                value={sshHost}
                disabled={!editable}
                onChange={(e) => setSshHost(e.target.value)}
              />
              <Input
                aria-label={t('tabby.port')}
                placeholder={String(graph.settings.defaultSshPort)}
                inputMode="numeric"
                value={sshPort}
                disabled={!editable}
                onChange={(e) => setSshPort(e.target.value)}
              />
              <Input
                aria-label={t('tabby.user')}
                placeholder={graph.settings.defaultSshUser}
                value={sshUser}
                disabled={!editable}
                onChange={(e) => setSshUser(e.target.value)}
              />
            </div>
            <Input
              aria-label={t('tabby.profile')}
              placeholder={t('tabby.profilePlaceholder')}
              value={tabbyProfile}
              disabled={!editable}
              onChange={(e) => setTabbyProfile(e.target.value)}
            />
            <p className="text-xs text-ink-2">{t('tabby.noSecrets')}</p>
            {preview && (
              <div className="flex gap-2">
                {graph.settings.tabbyEnabled && (
                  <TabbyLinkButton url={preview.url} target={preview.target} />
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => void navigator.clipboard?.writeText(preview.ssh)}
                >
                  <IconCopy className="size-4" />
                  {t('tabby.copySsh')}
                </Button>
                <span className="self-center truncate font-mono text-xs text-ink-3">
                  {preview.ssh}
                </span>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label>{t('topology.links')}</Label>
            {links.length === 0 && <p className="text-xs text-ink-2">{t('topology.noLinks')}</p>}
            <ul className="space-y-1">
              {links.map((l) => {
                const outgoing = l.fromUuid === node.uuid;
                const other = outgoing ? l.toUuid : l.fromUuid;
                return (
                  <li key={l.uuid}>
                    <button
                      type="button"
                      onClick={() => onSelectNode(other)}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-sm hover:bg-secondary"
                    >
                      <span aria-hidden className="text-ink-3">
                        {outgoing ? '→' : '←'}
                      </span>
                      <span className="flex-1 truncate">{nameOf(other)}</span>
                      <span className="text-xs text-ink-3">{t(EDGE_STYLES[l.kind].labelKey)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          {editable && (
            <div className="flex gap-2">
              <Button className="flex-1" onClick={save} disabled={update.isPending}>
                {t('common.save')}
              </Button>
              <Button variant="ghost" onClick={remove}>
                {node.source === 'remnawave' ? t('topology.hide') : t('common.delete')}
              </Button>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
