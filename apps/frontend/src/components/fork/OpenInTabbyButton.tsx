import { IconTerminal2 } from '@tabler/icons-react';
import type { MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useServiceSshTargets, useTopologySettings } from '@/api/topology';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  TABBY_MIN_VERSION,
  type SshTarget,
  sshCommand,
  tabbyProfileUrl,
  tabbyQuickConnectUrl,
} from '@/lib/tabby';

const FOCUS_CHECK_MS = 1500;

/**
 * Opens a tabby:// link. A desktop app that took the link steals focus; if the tab still has it
 * after a moment, Tabby probably is not installed (or is too old), so offer the ssh command.
 * Plain location change, no window.open and no alert.
 */
export function openInTabby(url: string, target: SshTarget, copyLabel: string, hint: string) {
  window.location.href = url;
  window.setTimeout(() => {
    if (document.hidden || !document.hasFocus()) return;
    toast(hint, {
      duration: 10_000,
      action: {
        label: copyLabel,
        onClick: () => void navigator.clipboard?.writeText(sshCommand(target)),
      },
    });
  }, FOCUS_CHECK_MS);
}

interface ButtonProps {
  url: string;
  target: SshTarget;
  /** Small icon-only variant for table rows. */
  compact?: boolean;
}

export function TabbyLinkButton({ url, target, compact }: ButtonProps) {
  const { t } = useTranslation();
  const label = t('tabby.open');
  const click = (e: MouseEvent) => {
    // Table rows open a modal on click.
    e.stopPropagation();
    openInTabby(
      url,
      target,
      t('tabby.copySsh'),
      t('tabby.notOpened', { version: TABBY_MIN_VERSION }),
    );
  };
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size={compact ? 'icon-xs' : 'icon'}
          className="text-ink-3 hover:text-foreground"
          aria-label={label}
          onClick={click}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <IconTerminal2 className={compact ? 'size-3.5' : 'size-4'} />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

/**
 * "Open in Tabby" for a billing service: the saved Tabby profile when a topology node has one,
 * otherwise a quickConnect to the node's host or the service's first IP. Renders nothing when
 * Tabby buttons are off or the service has nowhere to connect to.
 */
export function OpenInTabbyButton({
  serviceUuid,
  compact,
}: {
  serviceUuid: string;
  compact?: boolean;
}) {
  const { data: settings } = useTopologySettings();
  const { data: targets } = useServiceSshTargets();
  const t = targets?.find((x) => x.serviceUuid === serviceUuid);
  if (!settings?.tabbyEnabled || !t) return null;
  const target = { user: t.user, host: t.host, port: t.port };
  const url = t.tabbyProfile ? tabbyProfileUrl(t.tabbyProfile) : tabbyQuickConnectUrl(target);
  return <TabbyLinkButton url={url} target={target} compact={compact} />;
}
