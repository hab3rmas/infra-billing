import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  type AccountProject,
  type ApplyAccountProjectsResult,
  type CreateTopologyLink,
  type CreateTopologyMap,
  type CreateTopologyNode,
  FORK_API_PATH,
  type SeedResult,
  type TopologyGraph,
  type TopologyLink,
  type TopologyMap,
  type TopologyNode,
  type TopologySettings,
  type UpdateTopologyLink,
  type UpdateTopologyMap,
  type UpdateTopologyNode,
  type UpdateTopologySettings,
} from '@infra/shared';
import { API_PATH, type ProjectStats } from '@infra/shared';
import { api } from './client';

const MAPS_KEY = ['topology', 'maps'];
export const graphKey = (mapUuid: string | undefined) => ['topology', 'graph', mapUuid];
const SETTINGS_KEY = ['topology', 'settings'];
const ACCOUNT_PROJECTS_KEY = ['account-projects'];

export function useTopologyMaps() {
  return useQuery({
    queryKey: MAPS_KEY,
    queryFn: async () => (await api.get<TopologyMap[]>(FORK_API_PATH.TOPOLOGY.MAPS)).data,
  });
}

export function useTopologyGraph(mapUuid: string | undefined) {
  return useQuery({
    queryKey: graphKey(mapUuid),
    enabled: Boolean(mapUuid),
    queryFn: async () => (await api.get<TopologyGraph>(FORK_API_PATH.TOPOLOGY.MAP(mapUuid!))).data,
  });
}

type Qc = ReturnType<typeof useQueryClient>;
const refreshGraph = (qc: Qc, mapUuid: string) => {
  qc.invalidateQueries({ queryKey: graphKey(mapUuid) });
  qc.invalidateQueries({ queryKey: MAPS_KEY });
};

export function useCreateMap() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (dto: CreateTopologyMap) =>
      (await api.post<TopologyMap>(FORK_API_PATH.TOPOLOGY.MAPS, dto)).data,
    // A new project may have been created along with the map.
    onSuccess: () => qc.invalidateQueries(),
  });
}

export function useUpdateMap() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ uuid, dto }: { uuid: string; dto: UpdateTopologyMap }) =>
      (await api.patch<TopologyMap>(FORK_API_PATH.TOPOLOGY.MAP(uuid), dto)).data,
    onSuccess: (_d, v) => refreshGraph(qc, v.uuid),
  });
}

export function useDeleteMap() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (uuid: string) => {
      await api.delete(FORK_API_PATH.TOPOLOGY.MAP(uuid));
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['topology'] }),
  });
}

export function useDuplicateMap() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (uuid: string) =>
      (await api.post<TopologyMap>(FORK_API_PATH.TOPOLOGY.MAP_DUPLICATE(uuid))).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: MAPS_KEY }),
  });
}

export function useSeedMap() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (uuid: string) =>
      (await api.post<SeedResult>(FORK_API_PATH.TOPOLOGY.MAP_SEED(uuid), {})).data,
    onSuccess: (_d, uuid) => refreshGraph(qc, uuid),
  });
}

export function useCreateNode(mapUuid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (dto: CreateTopologyNode) =>
      (await api.post<TopologyNode>(FORK_API_PATH.TOPOLOGY.NODES, dto)).data,
    onSuccess: () => refreshGraph(qc, mapUuid),
  });
}

export function useUpdateNode(mapUuid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ uuid, dto }: { uuid: string; dto: UpdateTopologyNode }) =>
      (await api.patch<TopologyNode>(FORK_API_PATH.TOPOLOGY.NODE(uuid), dto)).data,
    onSuccess: () => refreshGraph(qc, mapUuid),
  });
}

export function useDeleteNode(mapUuid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (uuid: string) => {
      await api.delete(FORK_API_PATH.TOPOLOGY.NODE(uuid));
    },
    onSuccess: () => refreshGraph(qc, mapUuid),
  });
}

/** Bulk position save. No refetch: the canvas already shows the new positions. */
export function useSavePositions() {
  return useMutation({
    mutationFn: async (positions: { uuid: string; x: number; y: number }[]) =>
      (await api.patch(FORK_API_PATH.TOPOLOGY.POSITIONS, { positions })).data,
  });
}

export function useCreateLink(mapUuid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (dto: CreateTopologyLink) =>
      (await api.post<TopologyLink>(FORK_API_PATH.TOPOLOGY.LINKS, dto)).data,
    onSuccess: () => refreshGraph(qc, mapUuid),
  });
}

export function useUpdateLink(mapUuid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ uuid, dto }: { uuid: string; dto: UpdateTopologyLink }) =>
      (await api.patch<TopologyLink>(FORK_API_PATH.TOPOLOGY.LINK(uuid), dto)).data,
    onSuccess: () => refreshGraph(qc, mapUuid),
  });
}

export function useDeleteLink(mapUuid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (uuid: string) => {
      await api.delete(FORK_API_PATH.TOPOLOGY.LINK(uuid));
    },
    onSuccess: () => refreshGraph(qc, mapUuid),
  });
}

export function useTopologySettings() {
  return useQuery({
    queryKey: SETTINGS_KEY,
    queryFn: async () => (await api.get<TopologySettings>(FORK_API_PATH.TOPOLOGY.SETTINGS)).data,
  });
}

export function useUpdateTopologySettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (dto: UpdateTopologySettings) =>
      (await api.patch<TopologySettings>(FORK_API_PATH.TOPOLOGY.SETTINGS, dto)).data,
    // The graph response embeds the settings too.
    onSuccess: () => qc.invalidateQueries({ queryKey: ['topology'] }),
  });
}

/** Existing per-project stats endpoint, reused for the project card on a map. */
export function useProjectStatsFor(projectUuid: string | null | undefined) {
  return useQuery({
    queryKey: ['analytics', 'project-stats', projectUuid],
    enabled: Boolean(projectUuid),
    queryFn: async () => (await api.get<ProjectStats>(API_PATH.PROJECTS.STATS(projectUuid!))).data,
  });
}

export function useAccountProjects() {
  return useQuery({
    queryKey: ACCOUNT_PROJECTS_KEY,
    queryFn: async () =>
      (await api.get<AccountProject[]>(FORK_API_PATH.ACCOUNT_PROJECTS.ROOT)).data,
  });
}

export function useSetAccountProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      accountUuid,
      projectUuid,
    }: {
      accountUuid: string;
      projectUuid: string | null;
    }) =>
      (
        await api.put<AccountProject>(FORK_API_PATH.ACCOUNT_PROJECTS.BY_ACCOUNT(accountUuid), {
          projectUuid,
        })
      ).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ACCOUNT_PROJECTS_KEY }),
  });
}

export function useApplyAccountProjects() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (dryRun: boolean) =>
      (
        await api.post<ApplyAccountProjectsResult>(FORK_API_PATH.ACCOUNT_PROJECTS.APPLY, null, {
          params: { dryRun },
        })
      ).data,
    onSuccess: (data) => {
      if (!data.dryRun) qc.invalidateQueries();
    },
  });
}
