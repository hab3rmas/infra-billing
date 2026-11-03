// Route paths for the fork's controllers. Kept apart from routes.ts so upstream merges stay clean;
// same helpers and style, and the same ID_PARAM so `:uuid` means the same on both sides.

import { ID_PARAM } from './routes';

const ID = `:${ID_PARAM}`;

/** Name of the `:accountUuid` route param of the account-projects controller. */
export const ACCOUNT_PARAM = 'accountUuid';

/** Controller base paths (the @Controller(...) argument). */
export const FORK_API = {
  TOPOLOGY: 'topology',
  ACCOUNT_PROJECTS: 'account-projects',
  PROFILES: 'profiles',
  REMNAWAVE: 'remnawave',
} as const;

/** Method sub-paths within a controller. */
export const FORK_API_SUB = {
  TOPOLOGY_MAPS: 'maps',
  TOPOLOGY_MAP_BY_ID: `maps/${ID}`,
  TOPOLOGY_MAP_DUPLICATE: `maps/${ID}/duplicate`,
  TOPOLOGY_MAP_SEED: `maps/${ID}/seed-from-services`,
  TOPOLOGY_NODES: 'nodes',
  TOPOLOGY_NODE_BY_ID: `nodes/${ID}`,
  TOPOLOGY_POSITIONS: 'positions',
  TOPOLOGY_LINKS: 'links',
  TOPOLOGY_LINK_BY_ID: `links/${ID}`,
  TOPOLOGY_SETTINGS: 'settings',
  TOPOLOGY_TABBY_PROFILES: 'tabby-profiles',
  TOPOLOGY_TABBY_ADOPT: 'tabby-profiles/adopt',
  TOPOLOGY_SERVICE_TARGETS: 'service-targets',
  ACCOUNT_PROJECTS_APPLY: 'apply',
  ACCOUNT_PROJECT_BY_ACCOUNT: `:${ACCOUNT_PARAM}`,
  PROFILE_BY_ID: ID,
  PROFILE_PROJECTS: `${ID}/projects`,
  PROFILE_TEST: `${ID}/test-notification`,
  PROFILES_CONFIG: 'config',
  RW_INTEGRATIONS: 'integrations',
  RW_INTEGRATION_BY_ID: `integrations/${ID}`,
  RW_TEST: `integrations/${ID}/test`,
  RW_SYNC: `integrations/${ID}/sync`,
  RW_REVEAL: `integrations/${ID}/credentials/reveal`,
} as const;

const path = (controller: string, sub?: string): string =>
  sub ? `/${controller}/${sub}` : `/${controller}`;
const pathId = (controller: string, sub: string, uuid: string): string =>
  `/${controller}/${sub.replace(ID, uuid)}`;

/** Concrete, prefix-relative paths for the frontend client. */
export const FORK_API_PATH = {
  TOPOLOGY: {
    MAPS: path(FORK_API.TOPOLOGY, FORK_API_SUB.TOPOLOGY_MAPS),
    MAP: (uuid: string) => pathId(FORK_API.TOPOLOGY, FORK_API_SUB.TOPOLOGY_MAP_BY_ID, uuid),
    MAP_DUPLICATE: (uuid: string) =>
      pathId(FORK_API.TOPOLOGY, FORK_API_SUB.TOPOLOGY_MAP_DUPLICATE, uuid),
    MAP_SEED: (uuid: string) => pathId(FORK_API.TOPOLOGY, FORK_API_SUB.TOPOLOGY_MAP_SEED, uuid),
    NODES: path(FORK_API.TOPOLOGY, FORK_API_SUB.TOPOLOGY_NODES),
    NODE: (uuid: string) => pathId(FORK_API.TOPOLOGY, FORK_API_SUB.TOPOLOGY_NODE_BY_ID, uuid),
    POSITIONS: path(FORK_API.TOPOLOGY, FORK_API_SUB.TOPOLOGY_POSITIONS),
    LINKS: path(FORK_API.TOPOLOGY, FORK_API_SUB.TOPOLOGY_LINKS),
    LINK: (uuid: string) => pathId(FORK_API.TOPOLOGY, FORK_API_SUB.TOPOLOGY_LINK_BY_ID, uuid),
    SETTINGS: path(FORK_API.TOPOLOGY, FORK_API_SUB.TOPOLOGY_SETTINGS),
    TABBY_PROFILES: path(FORK_API.TOPOLOGY, FORK_API_SUB.TOPOLOGY_TABBY_PROFILES),
    TABBY_ADOPT: path(FORK_API.TOPOLOGY, FORK_API_SUB.TOPOLOGY_TABBY_ADOPT),
    SERVICE_TARGETS: path(FORK_API.TOPOLOGY, FORK_API_SUB.TOPOLOGY_SERVICE_TARGETS),
  },
  ACCOUNT_PROJECTS: {
    ROOT: path(FORK_API.ACCOUNT_PROJECTS),
    BY_ACCOUNT: (accountUuid: string) => `/${FORK_API.ACCOUNT_PROJECTS}/${accountUuid}`,
    APPLY: path(FORK_API.ACCOUNT_PROJECTS, FORK_API_SUB.ACCOUNT_PROJECTS_APPLY),
  },
  REMNAWAVE: {
    INTEGRATIONS: path(FORK_API.REMNAWAVE, FORK_API_SUB.RW_INTEGRATIONS),
    INTEGRATION: (uuid: string) =>
      pathId(FORK_API.REMNAWAVE, FORK_API_SUB.RW_INTEGRATION_BY_ID, uuid),
    TEST: (uuid: string) => pathId(FORK_API.REMNAWAVE, FORK_API_SUB.RW_TEST, uuid),
    SYNC: (uuid: string) => pathId(FORK_API.REMNAWAVE, FORK_API_SUB.RW_SYNC, uuid),
    REVEAL: (uuid: string) => pathId(FORK_API.REMNAWAVE, FORK_API_SUB.RW_REVEAL, uuid),
  },
  PROFILES: {
    ROOT: path(FORK_API.PROFILES),
    CONFIG: path(FORK_API.PROFILES, FORK_API_SUB.PROFILES_CONFIG),
    BY_ID: (uuid: string) => pathId(FORK_API.PROFILES, FORK_API_SUB.PROFILE_BY_ID, uuid),
    PROJECTS: (uuid: string) => pathId(FORK_API.PROFILES, FORK_API_SUB.PROFILE_PROJECTS, uuid),
    TEST: (uuid: string) => pathId(FORK_API.PROFILES, FORK_API_SUB.PROFILE_TEST, uuid),
  },
} as const;

/** Header the frontend sends to scope every request to one profile. */
export const PROFILE_HEADER = 'X-Profile';

/** Swagger tags for the fork's controllers (kept here instead of editing controllers-info.ts). */
export const FORK_CONTROLLERS_INFO = {
  TOPOLOGY: { TAG: 'Topology', DESCRIPTION: 'Infrastructure maps: servers and links between them' },
  ACCOUNT_PROJECTS: {
    TAG: 'Account Projects',
    DESCRIPTION: 'Default project for new services synced from a provider account',
  },
  REMNAWAVE: { TAG: 'Remnawave', DESCRIPTION: 'Import of Remnawave panels into topology maps' },
  PROFILES: { TAG: 'Profiles', DESCRIPTION: 'Workspaces that group projects (VPN, Site 1…)' },
} as const;
