#!/usr/bin/env node
/**
 * Fork: screenshots of the topology page in light and dark (every map, plus a node sheet and the
 * account-projects settings page).
 *
 *   CAPTURE_URL=http://127.0.0.1:8091 CAPTURE_USER=owner CAPTURE_PASSWORD=… \
 *     node scripts/fork-capture-topology.mjs
 *
 * CAPTURE_MAPS=<uuid>,<uuid> lists the maps to shoot. Output: docs/fork/topology-*.png. CAPTURE_BROWSER_PATH overrides the browser (default: Chrome).
 */
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'docs', 'fork');
const base = (process.env.CAPTURE_URL ?? 'http://127.0.0.1:8080').replace(/\/$/, '');
const user = process.env.CAPTURE_USER ?? '';
const password = process.env.CAPTURE_PASSWORD ?? '';
if (!user || !password) throw new Error('Set CAPTURE_USER and CAPTURE_PASSWORD');

await mkdir(out, { recursive: true });
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
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.goto(`${base}/login`);
  await page.locator('input').first().fill(user);
  await page.locator('input[type=password]').first().fill(password);
  await page.keyboard.press('Enter');
  await page.waitForURL(`${base}/`);

  const maps = (process.env.CAPTURE_MAPS ?? '').split(',').filter(Boolean);
  if (maps.length === 0) throw new Error('Set CAPTURE_MAPS=<map uuid>,<map uuid>');
  for (const [i, uuid] of maps.entries()) {
    await page.goto(`${base}/topology?map=${uuid}`);
    await page.waitForSelector('.react-flow__node');
    await page.waitForTimeout(1800); // elk layout + fitView
    await page.screenshot({ path: path.join(out, `topology-map${i + 1}-${scheme}.png`) });
  }

  // Node sheet of the first card of the first map.
  await page.goto(`${base}/topology?map=${maps[0]}`);
  await page.waitForSelector('.react-flow__node-server');
  await page.waitForTimeout(1200);
  await page.locator('.react-flow__node-server').first().click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(out, `topology-sheet-${scheme}.png`) });

  await page.goto(`${base}/settings/topology`);
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: path.join(out, `topology-settings-${scheme}.png`) });

  const real = errors.filter((e) => !e.includes('401'));
  if (real.length) console.log(`[${scheme}] console errors:\n${real.join('\n')}`);
  await ctx.close();
}
await browser.close();
console.log(`Saved to ${out}`);
