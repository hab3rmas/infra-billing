import { AsyncLocalStorage } from 'node:async_hooks';

// Profile (workspace) scope. Pure: no Nest / Prisma imports, so the rules are unit-testable.
//
// Membership is computed, never stored on upstream tables:
//   project  -> profile_projects
//   service  -> its project
//   account  -> default project (account_default_projects) in the profile, or a service in it
// An account used by several profiles is "shared": visible in each, but counted (balance, runway,
// sync errors) only in its home profile.

export interface ProfileScope {
  /** null = the "outside profiles" bucket (projects that belong to no profile). */
  profileUuid: string | null;
  /** Display name, used as the notification label. */
  profileName: string | null;
  projectUuids: string[];
  /** Accounts visible in this scope (home + shared). */
  accountUuids: string[];
  /** Accounts counted in this scope's totals and notifications. */
  homeAccountUuids: string[];
  /** Visible accounts whose home is another profile. */
  foreignAccountUuids: string[];
}

export const profileScopeStorage = new AsyncLocalStorage<ProfileScope>();

export const currentProfileScope = (): ProfileScope | undefined => profileScopeStorage.getStore();

export interface ScopeInput {
  /** Profiles in display order (the order breaks ties for an account's home). */
  profiles: { uuid: string; name: string }[];
  profileProjects: { projectUuid: string; profileUuid: string }[];
  allProjectUuids: string[];
  services: { accountUuid: string; projectUuid: string }[];
  accountDefaults: { accountUuid: string; projectUuid: string }[];
}

type Bucket = string | null;

/** Profile whose "home" an account is: its default project's profile, else where it has most services. */
export function homeProfileOf(accountUuid: string, input: ScopeInput): Bucket {
  const profileOfProject = new Map(
    input.profileProjects.map((p) => [p.projectUuid, p.profileUuid]),
  );
  const def = input.accountDefaults.find((d) => d.accountUuid === accountUuid);
  if (def) return profileOfProject.get(def.projectUuid) ?? null;
  const counts = new Map<Bucket, number>();
  for (const s of input.services) {
    if (s.accountUuid !== accountUuid) continue;
    const b = profileOfProject.get(s.projectUuid) ?? null;
    counts.set(b, (counts.get(b) ?? 0) + 1);
  }
  let best: Bucket = null;
  let bestCount = 0;
  // Profiles first (in display order), so a tie goes to the earlier profile, not to "outside".
  for (const b of [...input.profiles.map((p) => p.uuid), null] as Bucket[]) {
    const c = counts.get(b) ?? 0;
    if (c > bestCount) {
      best = b;
      bestCount = c;
    }
  }
  return best;
}

export function computeScope(input: ScopeInput, profileUuid: Bucket): ProfileScope {
  const profileOfProject = new Map(
    input.profileProjects.map((p) => [p.projectUuid, p.profileUuid]),
  );
  const inBucket = (projectUuid: string) =>
    (profileOfProject.get(projectUuid) ?? null) === profileUuid;
  const projectUuids = input.allProjectUuids.filter(inBucket);

  const visible = new Set<string>();
  for (const d of input.accountDefaults) if (inBucket(d.projectUuid)) visible.add(d.accountUuid);
  for (const s of input.services) if (inBucket(s.projectUuid)) visible.add(s.accountUuid);

  const accountUuids = [...visible];
  const homeAccountUuids = accountUuids.filter((a) => homeProfileOf(a, input) === profileUuid);
  const home = new Set(homeAccountUuids);
  return {
    profileUuid,
    profileName: input.profiles.find((p) => p.uuid === profileUuid)?.name ?? null,
    projectUuids,
    accountUuids,
    homeAccountUuids,
    foreignAccountUuids: accountUuids.filter((a) => !home.has(a)),
  };
}

/** Scope for a notification run: totals count only home accounts, so shared ones alert once. */
export const notificationScope = (s: ProfileScope): ProfileScope => ({
  ...s,
  accountUuids: s.homeAccountUuids,
});
