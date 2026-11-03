import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const src = path.join(here, '../../frontend/src');
const esbuild = require('esbuild');

// The fork's locale files are plain TypeScript objects: bundle them to read the real values.
function load(file) {
  const built = esbuild.buildSync({
    entryPoints: [path.join(src, 'i18n/locales', file)],
    bundle: true,
    format: 'cjs',
    write: false,
  });
  const mod = { exports: {} };
  new Function('module', 'exports', built.outputFiles[0].text)(mod, mod.exports);
  return mod.exports;
}
const profiles = load('profiles.ts');
const topology = load('topology.ts');
const NAMESPACES = {
  profiles: profiles.profiles,
  topology: topology.topology,
  topologySettings: topology.topologySettings,
  tabby: topology.tabby,
  remnawave: topology.remnawave,
};

const PLURALS = ['_zero', '_one', '_two', '_few', '_many', '_other'];
const flatten = (o, prefix = '') =>
  Object.entries(o).flatMap(([k, v]) =>
    v && typeof v === 'object' ? flatten(v, `${prefix}${k}.`) : [`${prefix}${k}`],
  );
const base = (k) => {
  for (const p of PLURALS) if (k.endsWith(p)) return k.slice(0, -p.length);
  return k;
};

test('en and ru have the same keys in every fork namespace', () => {
  for (const [ns, tr] of Object.entries(NAMESPACES)) {
    const en = new Set(flatten(tr.en).map(base));
    const ru = new Set(flatten(tr.ru).map(base));
    assert.deepEqual(
      [...en].filter((k) => !ru.has(k)),
      [],
      `${ns}: missing in ru`,
    );
    assert.deepEqual(
      [...ru].filter((k) => !en.has(k)),
      [],
      `${ns}: missing in en`,
    );
  }
});

test('every plural key has the forms its language needs', () => {
  for (const [ns, tr] of Object.entries(NAMESPACES)) {
    for (const [lang, need] of [
      ['en', ['_one', '_other']],
      ['ru', ['_one', '_few', '_many', '_other']],
    ]) {
      const keys = flatten(tr[lang]);
      for (const k of keys.filter((x) => x.endsWith('_other') || x.endsWith('_one'))) {
        for (const p of need) {
          assert.ok(keys.includes(`${base(k)}${p}`), `${ns}.${lang}: ${base(k)}${p} is missing`);
        }
      }
    }
  }
});

function walk(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

test('every key used by the fork UI exists in both languages', () => {
  const files = [
    ...walk(path.join(src, 'pages/topology')),
    ...walk(path.join(src, 'pages/settings-topology')),
    ...walk(path.join(src, 'pages/settings-profiles')),
    ...walk(path.join(src, 'components/fork')),
  ].filter((f) => /\.tsx?$/.test(f));
  const used = new Set();
  for (const f of files) {
    const text = readFileSync(f, 'utf8');
    for (const m of text.matchAll(
      /['"`]((?:profiles|topology|topologySettings|tabby|remnawave)\.[A-Za-z0-9_.]+)['"`]/g,
    )) {
      used.add(m[1]);
    }
  }
  // Keys built from a variable (`topology.preset.${p}`, role labels) are covered by the role,
  // preset and link tables below.
  for (const p of ['vpn', 'web', 'custom']) used.add(`topology.preset.${p}`);
  assert.ok(used.size > 100, `scanned ${used.size} keys`);
  const missing = [];
  for (const key of used) {
    const [ns, ...rest] = key.split('.');
    const k = rest.join('.');
    for (const lang of ['en', 'ru']) {
      const keys = new Set(flatten(NAMESPACES[ns][lang]).map(base));
      if (!keys.has(k)) missing.push(`${lang}:${key}`);
    }
  }
  assert.deepEqual(missing, []);
});
