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
  ACCOUNT_PROJECTS_APPLY: 'apply',
  ACCOUNT_PROJECT_BY_ACCOUNT: `:${ACCOUNT_PARAM}`,
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
  },
  ACCOUNT_PROJECTS: {
    ROOT: path(FORK_API.ACCOUNT_PROJECTS),
    BY_ACCOUNT: (accountUuid: string) => `/${FORK_API.ACCOUNT_PROJECTS}/${accountUuid}`,
    APPLY: path(FORK_API.ACCOUNT_PROJECTS, FORK_API_SUB.ACCOUNT_PROJECTS_APPLY),
  },
} as const;

/** Swagger tags for the fork's controllers (kept here instead of editing controllers-info.ts). */
export const FORK_CONTROLLERS_INFO = {
  TOPOLOGY: { TAG: 'Topology', DESCRIPTION: 'Infrastructure maps: servers and links between them' },
  ACCOUNT_PROJECTS: {
    TAG: 'Account Projects',
    DESCRIPTION: 'Default project for new services synced from a provider account',
  },
} as const;
