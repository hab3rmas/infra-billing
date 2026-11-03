#!/usr/bin/env node
/**
 * Fork: drives the profile switcher in a real browser and saves screenshots (light and dark).
 *
 *   CAPTURE_URL=http://127.0.0.1:8091 CAPTURE_USER=owner CAPTURE_PASSWORD=… \
 *     node scripts/fork-capture-profiles.mjs
 *
 * Needs a panel that already has at least two profiles with services (run
 * apps/backend/fork-test/profile-leak.mjs against it first). Output: docs/fork/*.png
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
// Prefer the installed Chrome (no browser download needed); CAPTURE_BROWSER_PATH overrides.
const browser = await chromium.launch(
  process.env.CAPTURE_BROWSER_PATH
    ? { executablePath: process.env.CAPTURE_BROWSER_PATH }
    : { channel: 'chrome' },
);

for (const scheme of ['light', 'dark']) {
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
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

  // Dashboard in "All", then open the switcher.
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: path.join(out, `profiles-all-${scheme}.png`) });
  await page
    .getByRole('button', { name: /Все профили|All profiles/ })
    .first()
    .click();
  await page.waitForTimeout(400); // let the menu finish animating
  await page.screenshot({ path: path.join(out, `profiles-switcher-${scheme}.png`) });

  // Pick the first profile in the list: every page now shows only its data.
  await page.getByRole('menuitem').first().click();
  await page.waitForLoadState('networkidle');
  await page.goto(`${base}/services`);
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: path.join(out, `profiles-services-${scheme}.png`) });

  await page.goto(`${base}/settings/profiles`);
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: path.join(out, `profiles-settings-${scheme}.png`) });

  if (errors.length) console.log(`[${scheme}] console errors:\n${errors.join('\n')}`);
  await ctx.close();
}
await browser.close();
console.log(`Saved to ${out}`);
