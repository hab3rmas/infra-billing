import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const yaml = require('js-yaml');
const script = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../scripts/tabby-merge.mjs',
);

test('merge keeps your profile (id, auth), adds flag + folder, adds new ones, drops no secrets', async () => {
  const topo = {
    items: [
      {
        name: 'Germany',
        host: 'de.example',
        port: 22,
        user: null,
        aliases: ['1.1.1.1'],
        profile: { id: 'ssh:custom:Germany:u1', icon: '<svg/>', group: 'g-nodes' },
      },
      {
        name: 'Spain',
        host: 'es.example',
        port: 2222,
        user: 'root',
        aliases: [],
        profile: { id: 'ssh:custom:Spain:u2', icon: '<svg/>', group: 'g-nodes' },
      },
    ],
    groups: [
      { id: 'g-root', name: 'Drakosha', icon: 'far fa-folder' },
      { id: 'g-nodes', name: 'Nodes', icon: 'far fa-folder', parentGroupId: 'g-root' },
    ],
    profiles: [],
  };
  const srv = http.createServer((req, res) => {
    assert.equal(req.headers.authorization, 'Bearer t');
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(topo));
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const dir = mkdtempSync(path.join(tmpdir(), 'tm-'));
  writeFileSync(
    path.join(dir, 'c.yaml'),
    yaml.dump({
      profiles: [
        {
          type: 'ssh',
          name: 'de-old',
          id: 'ssh:custom:de-old:keep',
          options: { host: '1.1.1.1', auth: 'publicKey', privateKeys: ['$vault:x'] },
        },
      ],
      groups: [
        { id: 'mine-root', name: 'DrakoshaVPN', icon: 'far fa-folder' },
        { id: 'mine-nodes', name: 'Nodes', icon: 'far fa-folder', parentGroupId: 'mine-root' },
      ],
      syncConfig: { token: 'SECRET-DO-NOT-COPY' },
    }),
  );
  const out = path.join(dir, 'o.yaml');
  const port = srv.address().port;
  await new Promise((resolve, reject) => {
    import('node:child_process').then(({ execFile }) =>
      execFile(
        'node',
        [
          script,
          '--config',
          path.join(dir, 'c.yaml'),
          '--url',
          `http://127.0.0.1:${port}`,
          '--token',
          't',
          '--root',
          'DrakoshaVPN',
          '--out',
          out,
        ],
        (e) => (e ? reject(e) : resolve()),
      ),
    );
  });
  srv.close();
  const text = readFileSync(out, 'utf8');
  assert.ok(!text.includes('SECRET'));
  const doc = yaml.load(text);
  const de = doc.profiles.find((p) => p.id === 'ssh:custom:de-old:keep');
  assert.equal(de.icon, '<svg/>');
  assert.equal(de.group, 'mine-nodes');
  assert.deepEqual(de.options.privateKeys, ['$vault:x']);
  const es = doc.profiles.find((p) => p.name === 'Spain');
  assert.equal(es.group, 'mine-nodes');
  assert.equal(es.options.port, 2222);
  assert.equal(es.options.auth, 'publicKey');
  assert.equal(doc.groups.length, 2);
  assert.deepEqual(Object.keys(doc).sort(), ['groups', 'profiles']);
});
