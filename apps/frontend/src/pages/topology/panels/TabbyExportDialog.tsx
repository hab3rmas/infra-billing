import { IconCopy, IconDownload } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { apiErrorMessage } from '@/api/client';
import { fetchTabbyYaml, useAdoptTabbyProfiles } from '@/api/topology';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { notifyError, notifySuccess } from '@/utils/notify';

// Export of SSH profiles for Tabby's config.yaml. No passwords or keys, only host, port and user.
export function TabbyExportDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const adopt = useAdoptTabbyProfiles();
  const [yaml, setYaml] = useState('');

  useEffect(() => {
    if (!open) return;
    fetchTabbyYaml()
      .then(setYaml)
      .catch((e) => notifyError(apiErrorMessage(e)));
  }, [open]);

  const download = () => {
    const url = URL.createObjectURL(new Blob([yaml], { type: 'application/yaml' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'tabby-profiles.yaml';
    a.click();
    URL.revokeObjectURL(url);
  };

  const doAdopt = async () => {
    if (!window.confirm(t('tabby.adoptConfirm'))) return;
    try {
      const { updated } = await adopt.mutateAsync();
      notifySuccess(t('tabby.adopted', { count: updated }));
      setYaml(await fetchTabbyYaml());
    } catch (e) {
      notifyError(apiErrorMessage(e));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('tabby.exportTitle')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-ink-2">{t('tabby.exportHint')}</p>
          <pre className="max-h-72 overflow-auto rounded-lg bg-secondary p-3 font-mono text-xs">
            {yaml || t('common.loading')}
          </pre>
          <div className="flex flex-wrap gap-2">
            <Button onClick={download} disabled={!yaml}>
              <IconDownload className="size-4" />
              {t('tabby.download')}
            </Button>
            <Button
              variant="ghost"
              onClick={() => void navigator.clipboard?.writeText(yaml)}
              disabled={!yaml}
            >
              <IconCopy className="size-4" />
              {t('common.copy')}
            </Button>
            <Button variant="ghost" onClick={doAdopt} disabled={adopt.isPending}>
              {t('tabby.adopt')}
            </Button>
          </div>
          <p className="text-xs text-ink-3">{t('tabby.adoptHint')}</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
