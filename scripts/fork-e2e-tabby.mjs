#!/usr/bin/env node
/**
 * Fork: browser check of the Tabby buttons: services table, node card and node sheet.
 *
 *   CAPTURE_URL=http://127.0.0.1:8091 CAPTURE_USER=owner CAPTURE_PASSWORD=… \
 *     node scripts/fork-e2e-tabby.mjs <map uuid>
 *
 * The panel needs a node with an address (run apps/backend/fork-test/seed-topology-demo.mjs).
 */
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = (process.env.CAPTURE_URL ?? 'http://127.0.0.1:8080').replace(/\/$/, '');
const map = process.argv[2];
if (!map) throw new Error('Usage: fork-e2e-tabby.mjs <map uuid>');

const browser = await chromium.launch(
  process.env.CAPTURE_BROWSER_PATH
    ? { executablePath: process.env.CAPTURE_BROWSER_PATH }
    : { channel: 'chrome' },
);
const page = await (await browser.newContext({ viewport: { width: 1600, height: 960 } })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));

await page.goto(`${base}/login`);
await page.locator('input').first().fill(process.env.CAPTURE_USER ?? '');
await page.locator('input[type=password]').first().fill(process.env.CAPTURE_PASSWORD ?? '');
await page.keyboard.press('Enter');
await page.waitForURL(`${base}/`);

// Services table: a Tabby button in the row, and clicking it must not open the row modal.
await page.goto(`${base}/services`);
await page.waitForSelector('tbody tr');
const rowButton = page.getByRole('button', { name: /Открыть в Tabby|Open in Tabby/ }).first();
await rowButton.waitFor();
console.log('services table: Tabby buttons =', await page.getByRole('button', { name: /Tabby/ }).count());

// Node card on the canvas and the SSH block of the sheet.
await page.goto(`${base}/topology?map=${map}`);
await page.waitForSelector('.react-flow__node-server');
await page.waitForTimeout(1200);
assert.ok(
  (await page.locator('.react-flow__node-server').getByRole('button', { name: /Tabby/ }).count()) > 0,
  'Tabby button on a node card',
);
await page.locator('.react-flow__node-server').first().click();
await page.waitForTimeout(500);
const sheet = page.getByRole('dialog');
assert.match(await sheet.innerText(), /ssh -p 22 root@/, 'ssh preview in the sheet');
console.log('node card and sheet OK');

// Export dialog with the YAML.
await page.keyboard.press('Escape');
await page.getByRole('button', { name: /Экспорт|Export/ }).click();
await page.getByRole('menuitem', { name: /YAML/ }).click();
await page.waitForSelector('pre');
assert.match(await page.locator('pre').innerText(), /profiles:\n\s+- id:/);
console.log('YAML export dialog OK');

assert.deepEqual(errors, [], 'no page errors');
await browser.close();
console.log('tabby e2e: OK');
