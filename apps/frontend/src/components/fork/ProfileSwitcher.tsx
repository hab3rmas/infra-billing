import type { Profile } from '@infra/shared';
import { useQueryClient } from '@tanstack/react-query';
import {
  IconCheck,
  IconChevronDown,
  IconLayersSubtract,
  IconPlus,
  IconSettings,
} from '@tabler/icons-react';
import { useEffect, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useProfiles, useProfilesConfig } from '@/api/profiles';
import { EntityLabel } from '@/components/EntityLabel';
import { ProviderIcon } from '@/components/ProviderIcon';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  getActiveProfile,
  profileSlugFromUrl,
  setActiveProfile,
  subscribeActiveProfile,
} from '@/lib/profileScope';
import { notifySuccess } from '@/utils/notify';

/** The active profile, or null for "All". Falls back to "All" when the stored one is gone. */
export function useActiveProfile(): { profile: Profile | null; enabled: boolean } {
  const uuid = useSyncExternalStore(subscribeActiveProfile, getActiveProfile);
  const { data: config } = useProfilesConfig();
  const { data: profiles } = useProfiles();
  const enabled = config?.enabled ?? false;
  return { profile: enabled ? (profiles?.find((p) => p.uuid === uuid) ?? null) : null, enabled };
}

/**
 * Workspace switcher at the top of the sidebar (like Cloudflare's account picker). "All profiles"
 * is the upstream view with no filter, the escape hatch if scoping ever misbehaves.
 */
export function ProfileSwitcher() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data: profiles } = useProfiles();
  const { profile, enabled } = useActiveProfile();
  const stored = useSyncExternalStore(subscribeActiveProfile, getActiveProfile);

  // A ?profile=<slug> link picks that profile; a stored profile that no longer exists is dropped.
  useEffect(() => {
    if (!enabled || !profiles) return;
    const slug = profileSlugFromUrl();
    const bySlug = slug ? profiles.find((p) => p.slug === slug) : undefined;
    if (bySlug && bySlug.uuid !== stored) {
      setActiveProfile(bySlug.uuid, bySlug.slug);
      qc.resetQueries();
    } else if (stored && !profiles.some((p) => p.uuid === stored)) {
      setActiveProfile(null);
      qc.resetQueries();
    }
  }, [enabled, profiles, stored, qc]);

  if (!enabled) return null;

  const choose = (next: Profile | null) => {
    if ((next?.uuid ?? null) === stored) return;
    setActiveProfile(next?.uuid ?? null, next?.slug);
    // Cached data belongs to the previous profile.
    qc.resetQueries();
    notifySuccess(t('profiles.switched', { name: next?.name ?? t('profiles.all') }));
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex h-9 w-full items-center gap-2 rounded-lg border border-hairline bg-background px-2.5 text-left text-sm outline-none hover:bg-sidebar-accent focus-visible:bg-sidebar-accent"
        >
          {profile ? (
            <ProviderIcon
              name={profile.name}
              src={profile.faviconLink}
              iconName={profile.iconName}
              iconBg={profile.iconBg}
              size={20}
            />
          ) : (
            <IconLayersSubtract aria-hidden stroke={1.5} className="size-5 text-ink-3" />
          )}
          <span className="flex-1 truncate">{profile?.name ?? t('profiles.all')}</span>
          <IconChevronDown aria-hidden className="size-4 text-ink-3" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="w-(--radix-dropdown-menu-trigger-width) min-w-56"
      >
        <DropdownMenuLabel className="text-xs font-normal text-ink-2">
          {t('profiles.switcherLabel')}
        </DropdownMenuLabel>
        {(profiles ?? []).map((p) => (
          <DropdownMenuItem key={p.uuid} onSelect={() => choose(p)} className="gap-2">
            <EntityLabel
              name={p.name}
              src={p.faviconLink}
              iconName={p.iconName}
              iconBg={p.iconBg}
              size={20}
            />
            <span className="ml-auto text-xs text-ink-3">{p.servicesCount}</span>
            {p.uuid === stored && <IconCheck aria-hidden className="size-4" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuItem onSelect={() => choose(null)} className="gap-2">
          <IconLayersSubtract aria-hidden stroke={1.5} className="size-5 text-ink-3" />
          <span className="flex-1">{t('profiles.all')}</span>
          {!stored && <IconCheck aria-hidden className="size-4" />}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => navigate('/settings/profiles?new=1')} className="gap-2">
          <IconPlus aria-hidden className="size-4" />
          {profiles?.length ? t('profiles.create') : t('profiles.createFirst')}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => navigate('/settings/profiles')} className="gap-2">
          <IconSettings aria-hidden className="size-4" />
          {t('profiles.manage')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Small badge next to the breadcrumb so every page shows which profile it is in. */
export function ProfileBadge() {
  const { profile } = useActiveProfile();
  if (!profile) return null;
  return (
    <span className="hidden shrink-0 rounded-md bg-sidebar-accent px-1.5 py-0.5 text-xs text-slate sm:inline">
      {profile.name}
    </span>
  );
}
