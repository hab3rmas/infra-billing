#!/usr/bin/env node
/**
 * Fork: browser check of the review / routes / filter / highlight features on an imported map.
 *
 *   CAPTURE_URL=http://127.0.0.1:8091 CAPTURE_USER=owner CAPTURE_PASSWORD=… \
 *     node scripts/fork-e2e-review.mjs
 *
 * Builds: a project with two billing servers (PL, SG), a map for it, a mock Remnawave panel with the
 * owner's scheme, an integration and a sync. Then drives the UI. Screenshots: docs/fork/review-*.png
 */
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { startRemnawaveMock } from '../apps/backend/fork-test/remnawave-mock.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'docs', 'fork');
const base = (process.env.CAPTURE_URL ?? 'http://127.0.0.1:8080').replace(/\/$/, '');
const RUN = Date.now().toString(36);
const TOKEN = 'review-token';
await mkdir(out, { recursive: true });
const mock = await startRemnawaveMock(TOKEN);

const browser = await chromium.launch(
  process.env.CAPTURE_BROWSER_PATH
    ? { executablePath: process.env.CAPTURE_BROWSER_PATH }
    : { channel: 'chrome' },
);
const page = await (
  await browser.newContext({ viewport: { width: 1600, height: 960 }, locale: 'ru-RU' })
).newPage();
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

const api = (method, p, body) =>
  page.evaluate(
    async ([m, u, b]) => {
      const r = await fetch(`/api${u}`, {
        method: m,
        headers: { 'content-type': 'application/json' },
        body: b ? JSON.stringify(b) : undefined,
      });
      const t = await r.text();
      if (!r.ok) throw new Error(`${m} ${u} ${r.status} ${t}`);
      return t ? JSON.parse(t) : null;
    },
    [method, p, body ?? null],
  );

// ---- fixture
const project = await api('POST', '/projects', { name: `Review ${RUN}` });
const provider = await api('POST', '/providers', {
  name: `Host ${RUN}`,
  kind: 'manual',
  account: {},
});
const account = (await api('GET', `/providers/${provider.uuid}`)).accounts[0].uuid;
const mk = (name, countryCode, cost) =>
  api('POST', '/services', {
    accountUuid: account,
    projectUuid: project.uuid,
    name,
    type: 'vps',
    cost,
    currency: 'EUR',
    period: 'monthly',
    countryCode,
  });
const svcPl = await mk(`svc-pl-${RUN}`, 'PL', '16.00');
await mk(`svc-sg-${RUN}`, 'SG', '5.00');
await mk(`svc-ru-${RUN}`, 'RU', '4.50');
const map = await api('POST', '/topology/maps', {
  name: `Review map ${RUN}`,
  preset: 'vpn',
  projectUuid: project.uuid,
});
const integration = await api('POST', '/remnawave/integrations', {
  name: `Mock ${RUN}`,
  mapUuid: map.uuid,
  baseUrl: mock.url,
  token: TOKEN,
});
const sync = await api('POST', `/remnawave/integrations/${integration.uuid}/sync`);
assert.ok(sync.nodesCreated >= 8);

await page.goto(`${base}/topology?map=${map.uuid}`);
await page.waitForSelector('.react-flow__node-server');
await page.waitForTimeout(2200);

// ---- 1. stronger chain highlight on hover
const server = page.locator('.react-flow__node-server', { hasText: 'madkid' }).first();
await server.hover();
await page.waitForTimeout(400);
const dimmed = await page.locator('.react-flow__node .opacity-\\[0\\.18\\]').count();
const ringed = await page.locator('.react-flow__node [class*="ring-slate"]').count();
assert.ok(
  dimmed >= 2 && ringed >= 2,
  `hover dims the rest (${dimmed}) and rings the chain (${ringed})`,
);
await page.screenshot({ path: path.join(out, `review-hover.png`) });
await page.mouse.move(5, 5);

// ---- 2. the project card says servers are not linked, and leads to the review
assert.ok(
  await page
    .getByText(/не привязан/)
    .first()
    .isVisible(),
  'project card mentions unlinked servers',
);
await page.getByRole('button', { name: 'Разобрать' }).click();
const dialog = page.getByRole('dialog');
await dialog.waitFor();
await page.waitForTimeout(500); // let the dialog finish animating
assert.ok(await dialog.getByText('Импортированные узлы без сервера из биллинга').isVisible());
await page.screenshot({ path: path.join(out, `review-dialog.png`) });
// Poland: same country -> one click links svc-pl
const suggestion = dialog.getByRole('button', { name: new RegExp(`svc-pl-${RUN}`) }).first();
await suggestion.click();
await page.waitForTimeout(1200);
const g = await api('GET', `/topology/maps/${map.uuid}`);
const pl = g.nodes.find((n) => n.serviceUuid === svcPl.uuid);
assert.ok(pl, 'the Polish node got the Polish server');
assert.equal(pl.meta.serviceOverridden, true, 'the owner link is protected from the sync');
await page.keyboard.press('Escape');
await page.waitForTimeout(600);

// ---- 3. routes and cost
await page.getByRole('button', { name: 'Меню схемы' }).click({ force: true });
await page.getByRole('menuitem', { name: 'Маршруты и стоимость' }).click();
const routes = page.getByRole('dialog');
await routes.waitFor();
const text = await routes.innerText();
assert.match(text, /маршрут 2/i);
assert.match(text, /маршрут 1/i);
assert.match(text, /16[,.]00/, 'the Polish server cost is on route 2');
await page.screenshot({ path: path.join(out, `review-routes.png`) });
await routes.getByRole('button', { name: 'Показать на схеме' }).last().click();
await page.waitForTimeout(700);
assert.ok(
  (await page.locator('.react-flow__node .opacity-\\[0\\.18\\]').count()) >= 1,
  'the route stays highlighted',
);
await page.screenshot({ path: path.join(out, `review-route-pinned.png`) });
await page.mouse.click(700, 150); // pane click clears it
await page.waitForTimeout(300);

// ---- 4. filter by country
const before = await page.locator('.react-flow__node-server').count();
await page.getByRole('button', { name: /Фильтр/ }).click();
await page.getByRole('button', { name: /PL/ }).click();
await page.waitForTimeout(500);
const after = await page.locator('.react-flow__node-server').count();
assert.ok(after < before && after >= 1, `the filter narrows the map (${before} -> ${after})`);
await page.keyboard.press('Escape');
await page.waitForTimeout(600);

// ---- 5. hidden items can be restored
const hid = g.links.find((l) => l.kind === 'warp');
await api('DELETE', `/topology/links/${hid.uuid}`);
await page.reload();
await page.waitForSelector('.react-flow__node-server');
await page.getByRole('button', { name: 'Меню схемы' }).click({ force: true });
await page.getByRole('menuitem', { name: 'Разбор схемы' }).click();
const review = page.getByRole('dialog');
await review.getByText('Скрытое').waitFor();
await review.getByRole('button', { name: 'Показать' }).first().click();
await page.waitForTimeout(800);
assert.equal(
  (await api('GET', `/topology/maps/${map.uuid}`)).links.find((l) => l.uuid === hid.uuid).hidden,
  false,
);

assert.deepEqual(errors, [], 'no page errors');
await browser.close();
mock.close();
console.log('review e2e: OK');
