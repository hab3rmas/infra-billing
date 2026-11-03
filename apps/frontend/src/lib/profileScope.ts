import { PROFILE_HEADER } from '@infra/shared';
import { api } from '@/api/client';

// The active profile (workspace). Imported once from main.tsx: it hooks the shared axios client so
// every request carries X-Profile, with no change to any upstream API module. No profile = "All",
// i.e. the panel behaves like upstream.

const STORAGE_KEY = 'profile';

type Listener = () => void;
const listeners = new Set<Listener>();

function readStored(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

let active: string | null = readStored();

export const getActiveProfile = (): string | null => active;

export const subscribeActiveProfile = (l: Listener): (() => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** Switch profile (null = "All"). Callers reset the query cache: it holds the old profile's data. */
export function setActiveProfile(uuid: string | null, slug?: string | null): void {
  active = uuid;
  try {
    if (uuid) localStorage.setItem(STORAGE_KEY, uuid);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage blocked: the choice still holds until reload.
  }
  syncUrl(slug ?? null);
  for (const l of listeners) l();
}

/** Keeps ?profile=<slug> in the address bar so a copied link opens the same profile. */
function syncUrl(slug: string | null): void {
  const url = new URL(window.location.href);
  if (slug) url.searchParams.set('profile', slug);
  else url.searchParams.delete('profile');
  window.history.replaceState(window.history.state, '', url);
}

/** ?profile=<slug> from the address bar, read once at startup by the switcher. */
export const profileSlugFromUrl = (): string | null =>
  new URLSearchParams(window.location.search).get('profile');

api.interceptors.request.use((config) => {
  // A request that sets the header itself (X-Profile: all) is left alone.
  if (active && !config.headers.has(PROFILE_HEADER)) config.headers.set(PROFILE_HEADER, active);
  return config;
});
