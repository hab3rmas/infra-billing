#!/usr/bin/env node
/**
 * Fork: browser check of the topology canvas: dragging a node saves its position, hovering dims the
 * rest of the graph, "Add node" creates a node.
 *
 *   CAPTURE_URL=http://127.0.0.1:8091 CAPTURE_USER=owner CAPTURE_PASSWORD=… \
 *     node scripts/fork-e2e-topology.mjs <map uuid>
 */
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = (process.env.CAPTURE_URL ?? 'http://127.0.0.1:8080').replace(/\/$/, '');
const map = process.argv[2];
if (!map) throw new Error('Usage: fork-e2e-topology.mjs <map uuid>');

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

await page.goto(`${base}/topology?map=${map}`);
await page.waitForSelector('.react-flow__node-server');
await page.waitForTimeout(1500);

const positions = () =>
  page.evaluate(async (m) => {
    const g = await (await fetch(`/api/topology/maps/${m}`)).json();
    return g.nodes.map((n) => [n.uuid, n.posX, n.posY]);
  }, map);

const before = await positions();
const node = page.locator('.react-flow__node-server').first();
const box = await node.boundingBox();
await page.mouse.move(box.x + 40, box.y + 30);
await page.mouse.down();
await page.mouse.move(box.x + 140, box.y + 130, { steps: 8 });
await page.mouse.up();
await page.waitForTimeout(1500); // debounce 600 ms + request
const after = await positions();
const moved = before.filter((b, i) => b[1] !== after[i][1] || b[2] !== after[i][2]);
assert.equal(moved.length, 1, 'dragging one node saves exactly its position');
console.log('drag saved:', moved.length, 'node');

await node.hover();
await page.waitForTimeout(300);
assert.ok((await page.locator('.react-flow__node .opacity-30').count()) > 0, 'hover dims others');
console.log('hover dims other nodes');

const count = await page.locator('.react-flow__node').count();
await page.getByRole('button', { name: /Добавить узел|Add node/ }).click();
await page.getByRole('button', { name: /Telegram-бот|Telegram bot/ }).click();
await page.getByRole('button', { name: /^(Добавить|Add)$/ }).click();
await page.waitForTimeout(1500);
assert.equal(await page.locator('.react-flow__node').count(), count + 1, 'node added');
console.log('add node works');

assert.deepEqual(errors, [], 'no page errors');
await browser.close();
console.log('topology e2e: OK');
