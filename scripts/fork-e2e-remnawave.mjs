#!/usr/bin/env node
/**
 * Fork: drives the Remnawave UI against a mock Remnawave API (the owner's scheme): add an
 * integration in the settings, test the connection, sync, and look at the imported map.
 *
 *   CAPTURE_URL=http://127.0.0.1:8091 CAPTURE_USER=owner CAPTURE_PASSWORD=… \
 *     node scripts/fork-e2e-remnawave.mjs
 *
 * Output: docs/fork/remnawave-*.png (light and dark).
 */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { snapshot } from '../apps/backend/fork-test/remnawave-fixtures.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'docs', 'fork');
const base = (process.env.CAPTURE_URL ?? 'http://127.0.0.1:8080').replace(/\/$/, '');
const user = process.env.CAPTURE_USER ?? '';
const password = process.env.CAPTURE_PASSWORD ?? '';
const TOKEN = 'ui-test-token';
const RUN = Date.now().toString(36); // names stay unique when the script is re-run
await mkdir(out, { recursive: true });

const snap = snapshot();
const payloads = {
  '/api/nodes': snap.nodes.map((n) => ({
    ...n,
    configProfile: {
      activeConfigProfileUuid: n.configProfileUuid,
      activeInbounds: n.activeInboundUuids.map((uuid) => ({ uuid })),
    },
  })),
  '/api/config-profiles': { configProfiles: snap.profiles },
  '/api/hosts': snap.hosts.map((h) => ({
    ...h,
    inbound: { configProfileUuid: h.configProfileUuid, configProfileInboundUuid: h.inboundUuid },
  })),
  '/api/system/metadata': { version: '2.1.0' },
};
const server = createServer((req, res) => {
  res.setHeader('content-type', 'application/json');
  const body = payloads[req.url ?? ''];
  if (req.headers.authorization !== `Bearer ${TOKEN}` || body === undefined) {
    res.statusCode = body === undefined ? 404 : 401;
    return res.end('{}');
  }
  res.end(JSON.stringify({ response: body }));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const mockUrl = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch(
  process.env.CAPTURE_BROWSER_PATH
    ? { executablePath: process.env.CAPTURE_BROWSER_PATH }
    : { channel: 'chrome' },
);

for (const scheme of ['light', 'dark']) {
  const ctx = await browser.newContext({
    viewport: { width: 1600, height: 960 },
    colorScheme: scheme,
    locale: 'ru-RU',
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${base}/login`);
  await page.locator('input').first().fill(user);
  await page.locator('input[type=password]').first().fill(password);
  await page.keyboard.press('Enter');
  await page.waitForURL(`${base}/`);

  // A fresh map for this run, through the API.
  const mapUuid = await page.evaluate(async (name) => {
    const r = await fetch('/api/topology/maps', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, preset: 'vpn' }),
    });
    return (await r.json()).uuid;
  }, `Remnawave ${scheme} ${RUN}`);

  // The empty map offers the connect link, which opens the form with the map preselected.
  await page.goto(`${base}/topology?map=${mapUuid}`);
  await page.getByRole('link', { name: /Подключить Remnawave|Connect Remnawave/ }).click();
  await page.getByLabel(/^Название|^Name/).fill(`Panel ${scheme} ${RUN}`);
  await page.getByLabel(/URL панели|Panel URL/).fill(mockUrl);
  await page.getByLabel(/API-токен|API token/).fill(TOKEN);
  await page.getByRole('button', { name: /^(Сохранить|Save)$/ }).click();
  await page.waitForSelector(`text=Panel ${scheme}`);

  const card = page.locator('div.rounded-xl', { hasText: `Panel ${scheme} ${RUN}` }).first();
  await card.getByRole('button', { name: /Проверить подключение|Test connection/ }).click();
  await page.waitForSelector('text=/2\\.1\\.0/');
  await card.getByRole('button', { name: /^(Синхронизировать|Sync)$/ }).click();
  await page.waitForSelector('text=/Синк:|Synced:/');
  await page.screenshot({ path: path.join(out, `remnawave-settings-${scheme}.png`) });

  await page.goto(`${base}/topology?map=${mapUuid}`);
  await page.waitForSelector('.react-flow__node-server');
  await page.waitForTimeout(2200);
  assert.ok((await page.locator('.react-flow__node').count()) >= 8, 'imported nodes are drawn');
  assert.ok(await page.getByRole('button', { name: /Синк Remnawave|Remnawave sync/ }).isVisible());
  await page.screenshot({ path: path.join(out, `remnawave-map-${scheme}.png`) });

  assert.deepEqual(errors, [], 'no page errors');
  await ctx.close();
}
await browser.close();
server.close();
console.log(`remnawave UI e2e: OK, screenshots in ${out}`);
