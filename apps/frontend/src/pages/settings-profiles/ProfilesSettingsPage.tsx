import type { Profile } from '@infra/shared';
import { IconBell, IconLoader2, IconPencil, IconPlus, IconTrash } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { apiErrorMessage } from '@/api/client';
import {
  useCreateProfile,
  useDeleteProfile,
  useAllProjects,
  useProfiles,
  useSetProfileProjects,
  useTestProfileNotification,
  useUpdateProfile,
} from '@/api/profiles';
import { Combobox } from '@/components/Combobox';
import { EntityLabel } from '@/components/EntityLabel';
import { IconAppearanceFields } from '@/components/IconAppearanceFields';
import { PageHeader } from '@/components/PageHeader';
import { DEFAULT_ICON_BG, canonicalTablerIconName } from '@/components/tablerIconCatalog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { notifyError, notifySuccess } from '@/utils/notify';

interface FormValues {
  name: string;
  iconName: string;
  iconBg: string;
  projectUuids: string[];
  defaultProjectUuid: string;
  notificationsEnabled: boolean;
  telegramChatId: string;
  telegramTopicId: string;
}

const EMPTY: FormValues = {
  name: '',
  iconName: '',
  iconBg: '',
  projectUuids: [],
  defaultProjectUuid: '',
  notificationsEnabled: true,
  telegramChatId: '',
  telegramTopicId: '',
};

export function ProfilesSettingsPage() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const { data: profiles, isLoading } = useProfiles();
  const { data: projects } = useAllProjects();
  const create = useCreateProfile();
  const update = useUpdateProfile();
  const setProjects = useSetProfileProjects();
  const del = useDeleteProfile();
  const test = useTestProfileNotification();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Profile | null>(null);
  const form = useForm<FormValues>({ defaultValues: EMPTY });

  const openCreate = () => {
    setEditing(null);
    form.reset({ ...EMPTY });
    setDialogOpen(true);
  };

  const openEdit = (p: Profile) => {
    setEditing(p);
    form.reset({
      name: p.name,
      iconName: p.iconName ?? '',
      iconBg: p.iconBg ?? '',
      projectUuids: p.projectUuids,
      defaultProjectUuid: p.defaultProjectUuid ?? '',
      notificationsEnabled: p.notificationsEnabled,
      telegramChatId: p.telegramChatId ?? '',
      telegramTopicId: p.telegramTopicId ?? '',
    });
    setDialogOpen(true);
  };

  // The switcher's "Create profile" lands here as ?new=1.
  // biome-ignore lint/correctness/useExhaustiveDependencies: opens once per ?new=1 visit
  useEffect(() => {
    if (params.get('new') && !isLoading) {
      openCreate();
      setParams({}, { replace: true });
    }
  }, [params, isLoading]);

  const submit = form.handleSubmit(async (v) => {
    const iconName = canonicalTablerIconName(v.iconName);
    const icon = iconName ? { iconName, iconBg: v.iconBg || DEFAULT_ICON_BG } : undefined;
    const common = {
      notificationsEnabled: v.notificationsEnabled,
      telegramChatId: v.telegramChatId.trim() || null,
      telegramTopicId: v.telegramTopicId.trim() || null,
      defaultProjectUuid: v.defaultProjectUuid || null,
    };
    try {
      if (editing) {
        await update.mutateAsync({
          uuid: editing.uuid,
          dto: {
            name: v.name.trim(),
            ...common,
            iconName: icon?.iconName ?? null,
            iconBg: icon?.iconBg ?? null,
          },
        });
        await setProjects.mutateAsync({ uuid: editing.uuid, projectUuids: v.projectUuids });
      } else {
        await create.mutateAsync({
          name: v.name.trim(),
          ...common,
          ...icon,
          projectUuids: v.projectUuids,
        });
      }
      setDialogOpen(false);
      notifySuccess(editing ? t('profiles.updated') : t('profiles.created'));
    } catch (e) {
      notifyError(apiErrorMessage(e));
    }
  });

  const doDelete = async (p: Profile) => {
    if (!window.confirm(t('profiles.confirmDelete', { name: p.name }))) return;
    try {
      await del.mutateAsync(p.uuid);
      notifySuccess(t('common.deleted'));
    } catch (e) {
      notifyError(apiErrorMessage(e));
    }
  };

  const doTest = async (p: Profile) => {
    try {
      const { sent } = await test.mutateAsync(p.uuid);
      if (sent) notifySuccess(t('profiles.testSent'));
      else notifyError(t('profiles.testNotSent'));
    } catch (e) {
      notifyError(apiErrorMessage(e));
    }
  };

  // First run: one profile per project that is not the shared default one.
  const createFromProjects = async () => {
    try {
      for (const p of (projects ?? []).filter((x) => x.servicesCount !== 0)) {
        await create.mutateAsync({
          name: p.name,
          projectUuids: [p.uuid],
          defaultProjectUuid: p.uuid,
          ...(p.iconName ? { iconName: p.iconName, iconBg: p.iconBg ?? DEFAULT_ICON_BG } : {}),
        });
      }
      notifySuccess(t('profiles.created'));
    } catch (e) {
      notifyError(apiErrorMessage(e));
    }
  };

  const projectName = (uuid: string) => projects?.find((p) => p.uuid === uuid)?.name ?? uuid;
  const pending = create.isPending || update.isPending || setProjects.isPending;
  const nameError = form.formState.errors.name;

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('profiles.title')}
        actions={
          <Button size="sm" onClick={openCreate}>
            <IconPlus className="size-4" />
            {t('common.add')}
          </Button>
        }
      />
      <p className="max-w-2xl text-sm text-ink-2">{t('profiles.intro')}</p>

      {!isLoading && profiles?.length === 0 && (
        <div className="space-y-3 rounded-xl border border-hairline p-5">
          <p className="text-sm">{t('profiles.emptyTitle')}</p>
          <p className="text-sm text-ink-2">{t('profiles.emptyHint')}</p>
          <div className="flex gap-2">
            <Button size="sm" onClick={openCreate}>
              {t('profiles.createFirst')}
            </Button>
            <Button size="sm" variant="ghost" onClick={createFromProjects} disabled={pending}>
              {t('profiles.fromProjects')}
            </Button>
          </div>
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        {(profiles ?? []).map((p) => (
          <div key={p.uuid} className="space-y-3 rounded-xl border border-hairline p-4">
            <div className="flex items-start justify-between gap-2">
              <EntityLabel
                name={p.name}
                src={p.faviconLink}
                iconName={p.iconName}
                iconBg={p.iconBg}
                size={28}
              />
              <div className="flex shrink-0 gap-1">
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={t('profiles.testMessage')}
                  title={t('profiles.testMessage')}
                  onClick={() => doTest(p)}
                >
                  <IconBell className="size-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={t('common.edit')}
                  onClick={() => openEdit(p)}
                >
                  <IconPencil className="size-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={t('common.delete')}
                  onClick={() => doDelete(p)}
                >
                  <IconTrash className="size-4" />
                </Button>
              </div>
            </div>
            <p className="text-xs text-ink-2">
              {t('profiles.servicesCount', { count: p.servicesCount })}
              {' · '}
              {p.projectUuids.length > 0
                ? p.projectUuids.map(projectName).join(', ')
                : t('profiles.noProjects')}
            </p>
            <p className="text-xs text-ink-3">
              {p.notificationsEnabled
                ? p.telegramChatId
                  ? t('profiles.notifyOwnChat')
                  : t('profiles.notifyGlobalChat')
                : t('profiles.notifyOff')}
            </p>
          </div>
        ))}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing ? t('profiles.modalEdit') : t('profiles.modalCreate')}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={submit} className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
            <div className="space-y-2">
              <Label htmlFor="profile-name">
                {t('profiles.fieldName')} <span className="text-ink-3">*</span>
              </Label>
              <Input
                id="profile-name"
                autoFocus
                placeholder={t('profiles.namePlaceholder')}
                aria-invalid={nameError ? true : undefined}
                {...form.register('name', {
                  validate: (v) => (v.trim() ? true : t('validation.enterName')),
                })}
              />
              {nameError && <p className="text-xs text-destructive">{nameError.message}</p>}
            </div>
            <IconAppearanceFields
              previewName={form.watch('name')}
              iconName={form.watch('iconName')}
              iconBg={form.watch('iconBg')}
              onIconNameChange={(v) => form.setValue('iconName', v, { shouldDirty: true })}
              onIconBgChange={(v) => form.setValue('iconBg', v, { shouldDirty: true })}
            />
            <Controller
              control={form.control}
              name="projectUuids"
              render={({ field }) => (
                <div className="space-y-2">
                  <Label>{t('profiles.fieldProjects')}</Label>
                  <p className="text-xs text-ink-2">{t('profiles.projectsHint')}</p>
                  <div className="max-h-44 space-y-1.5 overflow-y-auto rounded-md bg-field p-2">
                    {(projects ?? []).map((p) => (
                      <div key={p.uuid} className="flex items-center gap-2 text-sm">
                        <Checkbox
                          id={`profile-project-${p.uuid}`}
                          checked={field.value.includes(p.uuid)}
                          onCheckedChange={(on) =>
                            field.onChange(
                              on
                                ? [...field.value, p.uuid]
                                : field.value.filter((x) => x !== p.uuid),
                            )
                          }
                        />
                        <Label
                          htmlFor={`profile-project-${p.uuid}`}
                          className="truncate font-normal"
                        >
                          {p.name}
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            />
            <Controller
              control={form.control}
              name="defaultProjectUuid"
              render={({ field }) => (
                <div className="space-y-2">
                  <Label>{t('profiles.fieldDefaultProject')}</Label>
                  <Combobox
                    value={field.value}
                    onChange={field.onChange}
                    options={[
                      { value: '', label: t('common.none') },
                      ...(projects ?? [])
                        .filter((p) => form.watch('projectUuids').includes(p.uuid))
                        .map((p) => ({ value: p.uuid, label: p.name })),
                    ]}
                  />
                </div>
              )}
            />
            <Controller
              control={form.control}
              name="notificationsEnabled"
              render={({ field }) => (
                <div className="flex items-center justify-between gap-3">
                  <Label>{t('profiles.fieldNotifications')}</Label>
                  <Switch checked={field.value} onCheckedChange={field.onChange} />
                </div>
              )}
            />
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="profile-chat">{t('profiles.fieldChat')}</Label>
                <Input
                  id="profile-chat"
                  placeholder="-1001234567890"
                  {...form.register('telegramChatId')}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="profile-topic">{t('profiles.fieldTopic')}</Label>
                <Input id="profile-topic" placeholder="42" {...form.register('telegramTopicId')} />
              </div>
            </div>
            <p className="text-xs text-ink-2">{t('profiles.chatHint')}</p>
            <Button type="submit" className="w-full" disabled={pending}>
              {pending && <IconLoader2 className="size-4 animate-spin" />}
              {t('common.save')}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
