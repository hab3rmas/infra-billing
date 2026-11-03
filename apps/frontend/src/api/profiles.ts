import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  type CreateProfile,
  FORK_API_PATH,
  type Profile,
  type ProfileTestResult,
  type ProfilesConfig,
  PROFILE_HEADER,
  type TopologyMap,
  type UpdateProfile,
} from '@infra/shared';
import type { Project } from '@infra/shared';
import { API_PATH } from '@infra/shared';
import { api } from './client';

export const PROFILES_KEY = ['profiles'];

// A profile change moves projects between workspaces, so everything scoped must be re-read.
const invalidateAll = (qc: ReturnType<typeof useQueryClient>) => qc.invalidateQueries();

export function useProfilesConfig() {
  return useQuery({
    queryKey: [...PROFILES_KEY, 'config'],
    queryFn: async () => (await api.get<ProfilesConfig>(FORK_API_PATH.PROFILES.CONFIG)).data,
    staleTime: Number.POSITIVE_INFINITY,
  });
}

/** Every project, ignoring the active profile: profile management moves projects between them. */
export function useAllProjects() {
  return useQuery({
    queryKey: [...PROFILES_KEY, 'all-projects'],
    queryFn: async () =>
      (await api.get<Project[]>(API_PATH.PROJECTS.ROOT, { headers: { [PROFILE_HEADER]: 'all' } }))
        .data,
  });
}

/** Maps of every profile, ignoring the active one (profile management only). */
export function useAllMaps() {
  return useQuery({
    queryKey: [...PROFILES_KEY, 'all-maps'],
    queryFn: async () =>
      (
        await api.get<TopologyMap[]>(FORK_API_PATH.TOPOLOGY.MAPS, {
          headers: { [PROFILE_HEADER]: 'all' },
        })
      ).data,
  });
}

export function useProfiles() {
  return useQuery({
    queryKey: PROFILES_KEY,
    queryFn: async () => (await api.get<Profile[]>(FORK_API_PATH.PROFILES.ROOT)).data,
  });
}

export function useCreateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (dto: CreateProfile) =>
      (await api.post<Profile>(FORK_API_PATH.PROFILES.ROOT, dto)).data,
    onSuccess: () => invalidateAll(qc),
  });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ uuid, dto }: { uuid: string; dto: UpdateProfile }) =>
      (await api.patch<Profile>(FORK_API_PATH.PROFILES.BY_ID(uuid), dto)).data,
    onSuccess: () => invalidateAll(qc),
  });
}

export function useSetProfileProjects() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ uuid, projectUuids }: { uuid: string; projectUuids: string[] }) =>
      (await api.put<Profile>(FORK_API_PATH.PROFILES.PROJECTS(uuid), { projectUuids })).data,
    onSuccess: () => invalidateAll(qc),
  });
}

export function useDeleteProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ uuid, moveMapsTo }: { uuid: string; moveMapsTo?: string }) => {
      await api.delete(FORK_API_PATH.PROFILES.BY_ID(uuid), { params: { moveMapsTo } });
    },
    onSuccess: () => invalidateAll(qc),
  });
}

export function useTestProfileNotification() {
  return useMutation({
    mutationFn: async (uuid: string) =>
      (await api.post<ProfileTestResult>(FORK_API_PATH.PROFILES.TEST(uuid))).data,
  });
}
