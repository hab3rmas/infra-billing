// Tolerant parsers for Remnawave API responses. Every field is optional and unknown fields are
// ignored, so a minor API change degrades one feature instead of breaking the whole import.
import { z } from 'zod';
import type { RwHost, RwNode, RwProfile } from './remnawave.importer';

const looseObj = z.object({}).passthrough();

/** Remnawave wraps payloads in `{ response: … }`; accept the bare payload too. */
export function unwrap(raw: unknown): unknown {
  if (raw && typeof raw === 'object' && 'response' in raw)
    return (raw as { response: unknown }).response;
  return raw;
}

const asArray = (v: unknown, key?: string): unknown[] => {
  if (Array.isArray(v)) return v;
  if (v && typeof v === 'object' && key && Array.isArray((v as Record<string, unknown>)[key])) {
    return (v as Record<string, unknown[]>)[key];
  }
  return [];
};

const s = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);
const n = (v: unknown): number | null => {
  const num = typeof v === 'string' ? Number(v) : v;
  return typeof num === 'number' && Number.isFinite(num) ? num : null;
};
const uuidOf = (v: unknown): string | null =>
  typeof v === 'string' ? v : v && typeof v === 'object' ? s((v as { uuid?: unknown }).uuid) : null;

export function parseNodes(raw: unknown, warn: (m: string) => void): RwNode[] {
  const out: RwNode[] = [];
  for (const item of asArray(unwrap(raw), 'nodes')) {
    const parsed = looseObj.safeParse(item);
    if (!parsed.success) {
      warn('Skipped a node that is not an object');
      continue;
    }
    const o = parsed.data as Record<string, unknown>;
    const uuid = s(o.uuid);
    const address = s(o.address);
    if (!uuid || !address) {
      warn(`Skipped a node without uuid or address (${s(o.name) ?? 'unnamed'})`);
      continue;
    }
    const cp = (o.configProfile ?? {}) as Record<string, unknown>;
    out.push({
      uuid,
      name: s(o.name) ?? address,
      address,
      port: n(o.port),
      countryCode: s(o.countryCode),
      isConnected: o.isConnected === true,
      isDisabled: o.isDisabled === true,
      configProfileUuid: s(cp.activeConfigProfileUuid),
      activeInboundUuids: asArray(cp.activeInbounds)
        .map(uuidOf)
        .filter((x): x is string => x !== null),
    });
  }
  return out;
}

export interface RawProfile {
  uuid: string;
  name: string;
  config: unknown;
  inbounds: { uuid: string; tag: string }[];
}

export function parseProfileList(raw: unknown, warn: (m: string) => void): RawProfile[] {
  const out: RawProfile[] = [];
  for (const item of asArray(unwrap(raw), 'configProfiles')) {
    const parsed = looseObj.safeParse(item);
    if (!parsed.success) continue;
    const o = parsed.data as Record<string, unknown>;
    const uuid = s(o.uuid);
    if (!uuid) {
      warn('Skipped a config profile without uuid');
      continue;
    }
    out.push({
      uuid,
      name: s(o.name) ?? uuid,
      config: o.config ?? null,
      inbounds: asArray(o.inbounds)
        .map((i) => ({
          uuid: uuidOf(i),
          tag: i && typeof i === 'object' ? s((i as { tag?: unknown }).tag) : null,
        }))
        .filter((i): i is { uuid: string; tag: string } => i.uuid !== null && i.tag !== null),
    });
  }
  return out;
}

/** A single `GET /config-profiles/{uuid}` payload: the profile itself. */
export function parseProfile(raw: unknown, warn: (m: string) => void): RawProfile | null {
  return parseProfileList([unwrap(raw)], warn)[0] ?? null;
}

export function parseHosts(raw: unknown, warn: (m: string) => void): RwHost[] {
  const out: RwHost[] = [];
  for (const item of asArray(unwrap(raw), 'hosts')) {
    const parsed = looseObj.safeParse(item);
    if (!parsed.success) continue;
    const o = parsed.data as Record<string, unknown>;
    const uuid = s(o.uuid);
    if (!uuid) {
      warn('Skipped a host without uuid');
      continue;
    }
    const inbound = (o.inbound ?? {}) as Record<string, unknown>;
    out.push({
      uuid,
      remark: s(o.remark) ?? '',
      address: s(o.address) ?? '',
      port: n(o.port),
      isDisabled: o.isDisabled === true,
      inboundUuid: s(inbound.configProfileInboundUuid) ?? s(o.inboundUuid),
      configProfileUuid: s(inbound.configProfileUuid) ?? s(o.configProfileUuid),
      vlessRoute: n(o.vlessRoute ?? o.vlessRouteId),
    });
  }
  return out;
}

export function toProfiles(raw: RawProfile[]): RwProfile[] {
  return raw.map((p) => ({ uuid: p.uuid, name: p.name, config: p.config, inbounds: p.inbounds }));
}

/** Panel version out of a metadata-like payload, when the panel reports one. */
export function parseVersion(raw: unknown): string | null {
  const o = unwrap(raw);
  if (o && typeof o === 'object') {
    const v = (o as Record<string, unknown>).version;
    if (typeof v === 'string') return v;
  }
  return null;
}
