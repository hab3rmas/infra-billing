#!/usr/bin/env node
// Merge the topology's Tabby layout (folders + flags) into your own Tabby config.
//
//   node scripts/tabby-merge.mjs --config <tabby config.yaml> --url https://panel.example.com \
//        --token <API token> [--root DrakoshaVPN] [--out tabby-merged.yaml] [--no-inherit-auth]
//
// - Reads your config.yaml (read only) and fetches GET /api/topology/tabby-profiles?format=json.
// - A topology server is matched to your profile by host / IP / name. A matched profile keeps
//   everything it has (id, auth, vault keys) and only gets the flag icon and the folder.
// - New servers are added; they copy the auth of your most common profile (a vault reference, not a
//   secret) unless --no-inherit-auth. Profiles that are not in the topology are left alone.
// - Your existing folders are reused when the name and place match; --root names the top folder.
// - Writes ONLY `profiles:` and `groups:` to --out. Nothing else of your config (sync token, vault,
//   hotkeys) is copied, printed or sent anywhere. Close Tabby, then replace the two sections.

import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const yaml = require('js-yaml');

const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i > 0 ? process.argv[i + 1] : d;
};
const flag = (n) => process.argv.includes(`--${n}`);

const configPath = arg('config');
const base = arg('url');
const token = arg('token', process.env.INFRA_TOKEN);
const out = arg('out', 'tabby-merged.yaml');
const rootName = arg('root');
if (!configPath || !base || !token) {
  console.error(
    'usage: tabby-merge.mjs --config <file> --url <panel url> --token <token> [--root name]',
  );
  process.exit(2);
}

const mine = yaml.load(readFileSync(configPath, 'utf8')) ?? {};
const myProfiles = Array.isArray(mine.profiles) ? mine.profiles : [];
const myGroups = Array.isArray(mine.groups) ? mine.groups : [];

const res = await fetch(`${base.replace(/\/$/, '')}/api/topology/tabby-profiles?format=json`, {
  headers: { Authorization: `Bearer ${token}` },
});
if (!res.ok) {
  console.error(`panel answered ${res.status}`);
  process.exit(1);
}
const topo = await res.json();

// ---- folders -----------------------------------------------------------------------------------
const genGroups = new Map(topo.groups.map((g) => [g.id, g]));
const finalGroups = [...myGroups];
const groupMap = new Map(); // generated id -> final id
const resolveGroup = (id) => {
  if (groupMap.has(id)) return groupMap.get(id);
  const g = genGroups.get(id);
  const parent = g.parentGroupId ? resolveGroup(g.parentGroupId) : undefined;
  const name = !g.parentGroupId && rootName ? rootName : g.name;
  let hit = finalGroups.find((x) => x.name === name && (x.parentGroupId ?? undefined) === parent);
  if (!hit) {
    hit = {
      id: g.id,
      name,
      icon: g.icon,
      ...(g.color ? { color: g.color } : {}),
      ...(parent ? { parentGroupId: parent } : {}),
    };
    finalGroups.push(hit);
    created.groups.push(name);
  }
  groupMap.set(id, hit.id);
  return hit.id;
};

// ---- profiles ----------------------------------------------------------------------------------
const created = { groups: [], profiles: [] };
const matched = [];
const norm = (s) =>
  String(s ?? '')
    .trim()
    .toLowerCase();
const finalProfiles = [...myProfiles];
const used = new Set();

const findMine = (it) => {
  const keys = new Set([it.host, ...(it.aliases ?? [])].map(norm).filter(Boolean));
  const free = (p) => p.type === 'ssh' && !used.has(p);
  return (
    myProfiles.find((p) => free(p) && keys.has(norm(p.options?.host))) ??
    myProfiles.find((p) => free(p) && norm(p.name) === norm(it.name))
  );
};

// The auth block new profiles start from: the most common one among your SSH profiles.
const authOf = (p) =>
  JSON.stringify({ auth: p.options?.auth, privateKeys: p.options?.privateKeys });
const tally = new Map();
for (const p of myProfiles)
  if (p.type === 'ssh' && p.options?.auth) tally.set(authOf(p), (tally.get(authOf(p)) ?? 0) + 1);
const common = [...tally.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
const inherited = common && !flag('no-inherit-auth') ? JSON.parse(common) : {};

for (const it of topo.items) {
  if (!it.profile) continue;
  const group = resolveGroup(it.profile.group);
  const own = findMine(it);
  if (own) {
    used.add(own);
    own.icon = it.profile.icon;
    own.group = group;
    matched.push(`${own.name}  <-  ${it.name}`);
  } else {
    const opts = {
      host: it.host,
      ...(it.port !== 22 ? { port: it.port } : {}),
      ...(it.user ? { user: it.user } : {}),
      algorithms: {},
      input: {},
    };
    if (inherited.auth) opts.auth = inherited.auth;
    if (inherited.privateKeys) opts.privateKeys = inherited.privateKeys;
    finalProfiles.push({
      type: 'ssh',
      name: it.name,
      icon: it.profile.icon,
      options: opts,
      weight: -1,
      id: it.profile.id,
      group,
    });
    created.profiles.push(it.name);
  }
}

writeFileSync(
  out,
  `# Generated by tabby-merge.mjs. Replace "profiles:" and "groups:" in Tabby's config.yaml.\n${yaml.dump({ profiles: finalProfiles, groups: finalGroups }, { lineWidth: -1, noRefs: true })}`,
  'utf8',
);

const left = myProfiles.filter((p) => p.type === 'ssh' && !used.has(p)).map((p) => p.name);
console.log(`matched ${matched.length}: ${matched.join('; ') || '-'}`);
console.log(`new profiles ${created.profiles.length}: ${created.profiles.join(', ') || '-'}`);
console.log(`new folders ${created.groups.length}: ${created.groups.join(', ') || '-'}`);
console.log(`your profiles not in the topology (kept as they are): ${left.join(', ') || '-'}`);
console.log(`written: ${out}`);
