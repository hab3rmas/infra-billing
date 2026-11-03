#!/usr/bin/env node
/**
 * Fork: link a topology node to a billing service by hand in the node sheet (needed when the
 * Remnawave sync cannot match a node by IP or name), and check that the link is stored.
 *
 *   CAPTURE_URL=http://127.0.0.1:8091 CAPTURE_USER=owner CAPTURE_PASSWORD=… \
 *     node scripts/fork-e2e-link-service.mjs <map uuid>
 *
 */
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = (process.env.CAPTURE_URL ?? 'http://127.0.0.1:8080').replace(/\/$/, '');
const map = process.argv[2];
if (!map) throw new Error('Usage: fork-e2e-link-service.mjs <map uuid>');

const browser = await chromium.launch(
  process.env.CAPTURE_BROWSER_PATH
    ? { executablePath: process.env.CAPTURE_BROWSER_PATH }
    : { channel: 'chrome' },
);
const page = await (await browser.newContext({ viewport: { width: 1600, height: 960 } })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(`${base}/login`);
await page
  .locator('input')
  .first()
  .fill(process.env.CAPTURE_USER ?? '');
await page
  .locator('input[type=password]')
  .first()
  .fill(process.env.CAPTURE_PASSWORD ?? '');
await page.keyboard.press('Enter');
await page.waitForURL(`${base}/`);

const graph = () =>
  page.evaluate(async (m) => (await fetch(`/api/topology/maps/${m}`)).json(), map);

// Its own fixture: a bot card without a billing service, and a free server to link it to.
const stamp = Date.now().toString(36);
await page.evaluate(
  async ([m, label]) => {
    await fetch('/api/topology/nodes', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mapUuid: m, kind: 'external', role: 'bot', label }),
    });
  },
  [map, `Bot ${stamp}`],
);

await page.goto(`${base}/topology?map=${map}`);
await page.waitForSelector('.react-flow__node-server');
await page.waitForTimeout(1200);
const target = (await graph()).nodes.find(
  (n) => !n.serviceUuid && n.kind === 'external' && n.label === `Bot ${stamp}`,
);
assert.ok(target, 'a server node without a service exists');

await page.locator('.react-flow__node-server', { hasText: target.label }).first().click();
const sheet = page.getByRole('dialog');
await sheet.waitFor();
// The first combobox of the sheet is the billing service.
await sheet.getByRole('combobox').first().click();
await page.getByRole('option').nth(1).click(); // nth(0) is "No service"
await sheet.getByRole('button', { name: /^(Сохранить|Save)$/ }).click();
await page.waitForTimeout(1200);

const after = (await graph()).nodes.find((n) => n.uuid === target.uuid);
assert.ok(after.serviceUuid, 'the node is linked to a service');
assert.equal(after.meta.serviceOverridden, undefined, 'a hand-made node has no importer flags');
console.log(`linked "${target.label}" to ${after.service.name}`);

assert.deepEqual(errors, [], 'no page errors');
await browser.close();
console.log('link service e2e: OK');
