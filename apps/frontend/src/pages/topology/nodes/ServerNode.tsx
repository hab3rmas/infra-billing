import {
  IconCopy,
  IconArrowDown,
  IconArrowUp,
  IconDots,
  IconEyeOff,
  IconPencil,
} from '@tabler/icons-react';
import { Handle, type Node, type NodeProps, Position } from '@xyflow/react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { CountryFlag } from '@/components/CountryFlag';
import { ProviderIcon } from '@/components/ProviderIcon';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { TabbyLinkButton } from '@/components/fork/OpenInTabbyButton';
import { resolveTabbyTarget } from '@/lib/tabby';
import { cn } from '@/lib/utils';
import { formatMoney } from '@/utils/format';
import { useTopologyActions } from '../context';
import type { TopoNodeData } from '../graph';
import { ROLES } from '../roles';

// Quiet card in the panel's own tokens. VPN roles get an accent badge; infra and web roles stay
// neutral so the VPN chain stands out.
export function ServerNode({ data, selected }: NodeProps<Node<TopoNodeData>>) {
  const { t } = useTranslation();
  const actions = useTopologyActions();
  const n = data.node;
  const role = ROLES[n.role];
  const RoleIcon = role.icon;
  const svc = n.service;
  const name = n.label || svc?.name || t('topology.unnamed');
  const addresses = n.addresses.length
    ? n.addresses
    : (svc?.ipCandidates ?? []).slice(0, 1).map((value) => ({ value, direction: 'both' as const }));
  const online = n.meta.online;
  const tabby = actions.tabby ? resolveTabbyTarget(n, actions.tabby) : null;
  const [target, source] = data.vertical
    ? [Position.Top, Position.Bottom]
    : [Position.Left, Position.Right];

  return (
    <div
      className={cn(
        'w-[232px] rounded-xl border bg-card px-3 py-2.5 text-card-foreground shadow-xs transition-opacity',
        selected ? 'border-ring' : 'border-border',
        data.dimmed && 'opacity-30',
      )}
    >
      <Handle type="target" position={target} className="topology-handle" />
      <div className="flex items-center gap-2">
        {svc ? (
          <ProviderIcon
            name={svc.providerName}
            src={svc.providerFaviconLink}
            iconName={svc.providerIconName}
            size={20}
          />
        ) : (
          <RoleIcon aria-hidden stroke={1.5} className="size-5 shrink-0 text-ink-3" />
        )}
        {svc && <CountryFlag code={svc.countryCode} className="text-sm" />}
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{name}</span>
        {online !== undefined && (
          <span
            role="img"
            aria-label={online ? t('topology.online') : t('topology.offline')}
            className={cn('size-2 shrink-0 rounded-full', online ? 'bg-ok' : 'bg-destructive')}
          />
        )}
        {tabby && (
          <span className="nodrag">
            <TabbyLinkButton url={tabby.url} target={tabby.target} compact />
          </span>
        )}
        {actions.editable && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={t('topology.nodeMenu')}
                className="nodrag -mr-1 rounded p-0.5 text-ink-3 hover:bg-accent hover:text-foreground"
              >
                <IconDots className="size-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => actions.openNode(n.uuid)}>
                <IconPencil className="size-4" />
                {t('common.edit')}
              </DropdownMenuItem>
              {tabby && (
                <DropdownMenuItem onSelect={() => void navigator.clipboard?.writeText(tabby.ssh)}>
                  <IconCopy className="size-4" />
                  {t('tabby.copySsh')}
                </DropdownMenuItem>
              )}
              {svc && (
                <DropdownMenuItem asChild>
                  <Link to={`/services?selected=${svc.uuid}`}>{t('topology.openService')}</Link>
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onSelect={() => actions.hideNode(n.uuid)}>
                <IconEyeOff className="size-4" />
                {t('topology.hide')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      <div className="mt-1.5 flex items-center gap-1.5">
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px]',
            role.vpn ? 'bg-sidebar-accent text-slate' : 'bg-secondary text-ink-2',
          )}
        >
          <RoleIcon aria-hidden className="size-3" />
          {t(role.labelKey)}
        </span>
        {svc && (
          <span className="ml-auto text-[11px] text-ink-3">
            {formatMoney(svc.cost, svc.currency)}
          </span>
        )}
      </div>

      {addresses.length > 0 && (
        <ul className="mt-1.5 space-y-0.5 font-mono text-[11px] text-ink-2">
          {addresses.slice(0, 2).map((a) => (
            <li key={`${a.value}-${a.direction}`} className="flex items-center gap-1 truncate">
              {a.direction === 'in' && <IconArrowDown aria-hidden className="size-3 text-ink-3" />}
              {a.direction === 'out' && <IconArrowUp aria-hidden className="size-3 text-ink-3" />}
              <span className="truncate">{a.value}</span>
            </li>
          ))}
        </ul>
      )}
      <Handle type="source" position={source} className="topology-handle" />
    </div>
  );
}
