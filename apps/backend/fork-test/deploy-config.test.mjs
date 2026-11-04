import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (p) => readFileSync(path.join(root, p), 'utf8');
const yaml = require('js-yaml');

test('the CSP hash in the Caddyfile matches the inline theme script of index.html', () => {
  const html = read('apps/frontend/index.html');
  const inline = html.match(/<script>([\s\S]*?)<\/script>/);
  assert.ok(inline, 'index.html has an inline script');
  const hash = `sha256-${createHash('sha256').update(inline[1].replace(/\r\n/g, '\n')).digest('base64')}`;
  const caddy = read('deploy/Caddyfile');
  assert.ok(
    caddy.includes(`'${hash}'`),
    `Caddyfile CSP is stale: upstream changed the inline script. Run deploy/csp-hash.sh and put ${hash} into script-src.`,
  );
  // And nothing that would switch the protection off.
  assert.ok(!/unsafe-eval/.test(caddy));
  assert.ok(
    !/script-src[^;]*'unsafe-inline'/.test(caddy),
    'inline scripts are allowed only by hash',
  );
});

const compose = yaml.load(read('deploy/docker-compose.yml'));

test('only Caddy publishes ports; the panel and the database do not', () => {
  assert.ok(compose.services.caddy.ports.length >= 2);
  assert.equal(compose.services['infra-billing'].ports, undefined);
  assert.equal(compose.services['infra-billing-db'].ports, undefined);
});

test('the database lives on the internal network only', () => {
  assert.deepEqual(compose.services['infra-billing-db'].networks, ['backend']);
  assert.equal(compose.networks.backend.internal, true);
});

test('containers are locked down: no root, read-only, no capabilities, no new privileges', () => {
  const app = compose.services['infra-billing'];
  assert.equal(app.user, 'node');
  for (const name of ['caddy', 'infra-billing', 'infra-billing-db']) {
    const s = compose.services[name];
    assert.equal(s.read_only, true, `${name} has a read-only root filesystem`);
    assert.deepEqual(s.cap_drop, ['ALL'], `${name} drops all capabilities`);
    assert.ok(s.security_opt.includes('no-new-privileges:true'), `${name} no-new-privileges`);
    assert.ok(s.pids_limit > 0 && s.mem_limit, `${name} has limits`);
  }
});

test('the panel runs with the safe production switches and never exposes the docs', () => {
  const env = compose.services['infra-billing'].environment;
  assert.equal(env.NODE_ENV, 'production');
  assert.equal(env.DOCS, 'false');
  assert.equal(env.COOKIE_SECURE, 'true');
});

test('the database container does not get the panel secrets', () => {
  const dbEnv = Object.keys(compose.services['infra-billing-db'].environment);
  assert.ok(!dbEnv.includes('ENCRYPTION_KEY'));
  assert.equal(compose.services['infra-billing-db'].env_file, undefined);
});

test('the example env file has placeholders only and gen-secrets fills every one', () => {
  const example = read('deploy/.env.production.example');
  assert.ok(example.includes('__GENERATED__'));
  assert.ok(!/ENCRYPTION_KEY=[A-Za-z0-9+/]{40,}/.test(example), 'no real key in the example');
  const gen = read('deploy/gen-secrets.sh');
  for (const key of ['POSTGRES_PASSWORD', 'DATABASE_URL', 'ENCRYPTION_KEY']) {
    assert.ok(gen.includes(`^${key}=`), `gen-secrets.sh sets ${key}`);
  }
  assert.ok(gen.includes('chmod 600'));
  assert.ok(gen.includes('[ -e .env ]'), 'it refuses to overwrite an existing .env');
});

test('secrets files stay out of git', () => {
  const ignore = read('deploy/.gitignore');
  assert.ok(/^\.env$/m.test(ignore));
});
