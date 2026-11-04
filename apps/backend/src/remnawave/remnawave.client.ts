import { Agent as HttpAgent } from 'node:http';
import { Agent as HttpsAgent } from 'node:https';
import { Logger } from '@nestjs/common';
import axios, { type AxiosInstance } from 'axios';
import { REQUEST_TIMEOUT_MS } from '@connectors/common/http';
import { guardedLookup } from './remnawave.dns';
import { checkPanelUrl } from './remnawave.url';
import {
  parseHosts,
  parseNodes,
  parseProfile,
  parseProfileList,
  parseVersion,
  toProfiles,
} from './remnawave.parse';
import type { RwSnapshot } from './remnawave.importer';

export class RemnawaveError extends Error {}

export interface RemnawaveAuth {
  baseUrl: string;
  token: string;
  extraHeaders: Record<string, string>;
}

/**
 * Minimal Remnawave API client: Bearer token plus optional extra headers (a panel behind a reverse
 * proxy may want a secret cookie). Redirects are never followed, so the token cannot be sent to
 * another host. Neither the token nor the headers ever reach a log line or an error message.
 */
export class RemnawaveClient {
  private readonly logger = new Logger(RemnawaveClient.name);
  private readonly http: AxiosInstance;
  readonly warnings: string[] = [];

  constructor(auth: RemnawaveAuth) {
    const check = checkPanelUrl(auth.baseUrl);
    if (!check.ok) throw new RemnawaveError(check.reason);
    this.http = axios.create({
      baseURL: check.url,
      timeout: REQUEST_TIMEOUT_MS,
      maxRedirects: 0,
      // Vets the resolved address at connect time (metadata service, link-local, rebinding).
      httpAgent: new HttpAgent({ lookup: guardedLookup as never }),
      httpsAgent: new HttpsAgent({ lookup: guardedLookup as never }),
      headers: { ...auth.extraHeaders, Authorization: `Bearer ${auth.token}` },
      validateStatus: (s) => s >= 200 && s < 300,
    });
  }

  private warn = (m: string) => {
    this.warnings.push(m);
    this.logger.warn(m);
  };

  private async get(path: string): Promise<unknown> {
    try {
      return (await this.http.get(path)).data;
    } catch (e) {
      throw new RemnawaveError(describe(e, path));
    }
  }

  /** Panel version (best effort) and the number of nodes. */
  async test(): Promise<{ version: string | null; nodes: number }> {
    const nodes = parseNodes(await this.get('/api/nodes'), this.warn);
    let version: string | null = null;
    for (const p of ['/api/system/metadata', '/api/system/health']) {
      try {
        version = parseVersion(await this.get(p));
      } catch {
        // Older panels lack these routes: the node list already proved the token works.
      }
      if (version) break;
    }
    return { version, nodes: nodes.length };
  }

  async snapshot(input: {
    integrationUuid: string;
    panelUrl: string;
    subscriptionUrl: string | null;
    panelServiceUuid: string | null;
    subServiceUuid: string | null;
  }): Promise<RwSnapshot> {
    const nodes = parseNodes(await this.get('/api/nodes'), this.warn);
    const profiles = parseProfileList(await this.get('/api/config-profiles'), this.warn);
    // The list may omit the (large) config: fetch the profiles that nodes use one by one.
    const used = new Set(nodes.map((n) => n.configProfileUuid).filter((x): x is string => !!x));
    for (const p of profiles) {
      if (p.config || !used.has(p.uuid)) continue;
      try {
        const full = parseProfile(await this.get(`/api/config-profiles/${p.uuid}`), this.warn);
        p.config = full?.config ?? null;
        if (full && full.inbounds.length > 0) p.inbounds = full.inbounds;
      } catch {
        // Some versions only expose the computed config.
      }
      if (!p.config) {
        try {
          const computed = parseProfile(
            await this.get(`/api/config-profiles/${p.uuid}/computed-config`),
            this.warn,
          );
          p.config = computed?.config ?? null;
        } catch (e) {
          this.warn(`Config of profile "${p.name}" could not be read: ${(e as Error).message}`);
        }
      }
    }
    let hosts: ReturnType<typeof parseHosts> = [];
    try {
      hosts = parseHosts(await this.get('/api/hosts'), this.warn);
    } catch (e) {
      this.warn(`Hosts could not be read: ${(e as Error).message}`);
    }
    return { ...input, nodes, profiles: toProfiles(profiles), hosts };
  }
}

/** A message safe to show and log: status or network reason, never headers or the token. */
function describe(e: unknown, path: string): string {
  if (axios.isAxiosError(e)) {
    if (e.response) {
      const s = e.response.status;
      if (s >= 300 && s < 400) return `${path}: the panel redirected (redirects are not followed)`;
      if (s === 401 || s === 403) return `${path}: access denied (${s}), check the API token`;
      return `${path}: HTTP ${s}`;
    }
    if (e.code === 'ECONNABORTED') return `${path}: timed out`;
    if (e.code === 'EBLOCKED')
      return `${path}: the panel address is not allowed (loopback name or link-local)`;
    return `${path}: ${e.code ?? 'network error'}`;
  }
  return `${path}: request failed`;
}
