import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  type CreateRemnawaveIntegration,
  FORK_API_PATH,
  type RemnawaveIntegration,
  type RemnawaveReveal,
  type RemnawaveSyncSummary,
  type RemnawaveTestResult,
  type UpdateRemnawaveIntegration,
} from '@infra/shared';
import { api } from './client';

const KEY = ['remnawave', 'integrations'];

// A sync rewrites nodes and links of a map.
const refreshTopology = (qc: ReturnType<typeof useQueryClient>) => {
  qc.invalidateQueries({ queryKey: KEY });
  qc.invalidateQueries({ queryKey: ['topology'] });
};

export function useRemnawaveIntegrations() {
  return useQuery({
    queryKey: KEY,
    queryFn: async () =>
      (await api.get<RemnawaveIntegration[]>(FORK_API_PATH.REMNAWAVE.INTEGRATIONS)).data,
  });
}

export function useCreateRemnawaveIntegration() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (dto: CreateRemnawaveIntegration) =>
      (await api.post<RemnawaveIntegration>(FORK_API_PATH.REMNAWAVE.INTEGRATIONS, dto)).data,
    onSuccess: () => refreshTopology(qc),
  });
}

export function useUpdateRemnawaveIntegration() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ uuid, dto }: { uuid: string; dto: UpdateRemnawaveIntegration }) =>
      (await api.patch<RemnawaveIntegration>(FORK_API_PATH.REMNAWAVE.INTEGRATION(uuid), dto)).data,
    onSuccess: () => refreshTopology(qc),
  });
}

export function useDeleteRemnawaveIntegration() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ uuid, purge }: { uuid: string; purge: boolean }) => {
      await api.delete(FORK_API_PATH.REMNAWAVE.INTEGRATION(uuid), { params: { purge } });
    },
    onSuccess: () => refreshTopology(qc),
  });
}

export function useTestRemnawave() {
  return useMutation({
    mutationFn: async (uuid: string) =>
      (await api.post<RemnawaveTestResult>(FORK_API_PATH.REMNAWAVE.TEST(uuid))).data,
  });
}

export function useSyncRemnawave() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (uuid: string) =>
      (await api.post<RemnawaveSyncSummary>(FORK_API_PATH.REMNAWAVE.SYNC(uuid))).data,
    // Success or failure, lastSyncAt / lastSyncError changed.
    onSettled: () => refreshTopology(qc),
  });
}

/** Explicit reveal of the stored token (owner session only; API tokens get 403). */
export async function revealRemnawave(uuid: string): Promise<RemnawaveReveal> {
  return (await api.post<RemnawaveReveal>(FORK_API_PATH.REMNAWAVE.REVEAL(uuid))).data;
}
