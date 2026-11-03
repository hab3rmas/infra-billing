#!/usr/bin/env node
/**
 * Fork: the topology page at phone width: view only (no add / layout buttons, no dragging), a tap
 * on a node opens its sheet.
 *
 *   CAPTURE_URL=http://127.0.0.1:8091 CAPTURE_USER=owner CAPTURE_PASSWORD=… \
 *     node scripts/fork-e2e-mobile.mjs <map uuid>
 */
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'docs', 'fork');
const base = (process.env.CAPTURE_URL ?? 'http://127.0.0.1:8080').replace(/\/$/, '');
const map = process.argv[2];
if (!map) throw new Error('Usage: fork-e2e-mobile.mjs <map uuid>');
await mkdir(out, { recursive: true });

const browser = await chromium.launch(
  process.env.CAPTURE_BROWSER_PATH
    ? { executablePath: process.env.CAPTURE_BROWSER_PATH }
    : { channel: 'chrome' },
);
const ctx = await browser.newContext({
  viewport: { width: 390, height: 800 },
  hasTouch: true,
  isMobile: true,
  locale: 'ru-RU',
});
const page = await ctx.newPage();
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

await page.goto(`${base}/topology?map=${map}`);
// A phone gets the node list first: a canvas of many cards is unreadable at 390 px.
await page.getByRole('tab', { name: /Список|List/ }).waitFor();
assert.ok((await page.locator('ul li button').count()) >= 3, 'the node list is shown');
await page.screenshot({ path: path.join(out, 'topology-mobile-list.png') });
await page.getByRole('tab', { name: /Схема|Map/ }).click();
await page.waitForSelector('.react-flow__node-server');
await page.waitForTimeout(1500);
assert.equal(
  await page.getByRole('button', { name: /Добавить узел|Add node/ }).count(),
  0,
  'no add button',
);
assert.equal(
  await page.getByRole('button', { name: /Авто-раскладка|Auto-layout/ }).count(),
  0,
  'no layout button',
);

const draggable = await page.locator('.react-flow__node-server').first().getAttribute('class');
assert.ok(!draggable.includes('draggable'), 'nodes are not draggable');

await page.screenshot({ path: path.join(out, 'topology-mobile.png') });
await page.locator('.react-flow__node-server').first().tap({ force: true });
await page.waitForTimeout(600);
assert.ok(await page.getByRole('dialog').isVisible(), 'tap opens the node sheet');
await page.screenshot({ path: path.join(out, 'topology-mobile-sheet.png') });

assert.deepEqual(errors, [], 'no page errors');
await browser.close();
console.log('topology mobile: OK');
