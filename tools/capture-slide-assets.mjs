// Captures close-up UI component images for the presentation into docs/slides/assets/.
// Prereqs: `npm run reset` (fresh seed) and `npm run dev` running. Usage: npm run docs:slide-assets
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = path.join(root, 'docs/slides/assets');
const WEB = process.env.WEB || 'http://localhost:5173';
const chrome = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
fs.mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({ executablePath: chrome, headless: true });
const page = await browser.newPage();
page.on('dialog', (d) => d.dismiss());
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 3 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function go(p, wait = 1300) { await page.goto(WEB + p, { waitUntil: 'networkidle0' }); await sleep(wait); }
async function api(method, url, body) {
  return page.evaluate(async (m, u, b) => (await fetch('/api' + u, {
    method: m, headers: b ? { 'Content-Type': 'application/json' } : {}, body: b ? JSON.stringify(b) : undefined,
  })).json(), method, url, body);
}
async function clickText(text, sel = 'button, a') {
  for (const h of await page.$$(sel)) {
    if ((await h.evaluate((el) => el.textContent.trim())).includes(text)) { await h.click(); return; }
  }
  throw new Error(`No element with text "${text}"`);
}
async function setField(selector, value) {
  await page.evaluate((s, v) => {
    const el = typeof s === 'string' ? document.querySelector(s) : s;
    const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
    el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
  }, selector, value);
}
async function setLastSelect(value) {
  const selects = await page.$$('select');
  await selects[selects.length - 1].select(value);
  await sleep(300);
}
async function login(email) {
  await page.deleteCookie(...(await page.cookies()));
  await go('/login', 400);
  await page.type('input[type=email]', email);
  await page.type('input[type=password]', 'password123');
  await clickText('Sign in', 'button[type=submit]');
  await page.waitForNavigation({ waitUntil: 'networkidle0' }).catch(() => {});
  await sleep(1200);
}

/** Full-viewport capture. */
async function full(name, wait = 600) {
  await sleep(wait);
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
  console.log('✔', name);
}

/** Capture one element (found by a selector + contained text) with transparent page background. */
async function element(name, selector, text, { maxHeight = 2000, wait = 600, pad = 0 } = {}) {
  await sleep(wait);
  const handle = await page.evaluateHandle((sel, t) =>
    [...document.querySelectorAll(sel)].find((el) => !t || el.textContent.includes(t)), selector, text);
  const el = handle.asElement();
  if (!el) throw new Error(`element not found: ${selector} "${text}"`);
  await el.evaluate((n) => n.scrollIntoView({ block: 'start' }));
  await page.addStyleTag({ content: 'html,body,main,.bg-grid{background:transparent!important} header.sticky{visibility:hidden!important}' });
  await sleep(150);
  const box = await el.boundingBox();
  const scrollY = await page.evaluate(() => window.scrollY);
  await page.screenshot({
    path: path.join(OUT, `${name}.png`), omitBackground: true, captureBeyondViewport: true,
    clip: { x: box.x - pad, y: box.y + scrollY - pad, width: box.width + 2 * pad, height: Math.min(box.height, maxHeight) + 2 * pad },
  });
  await page.evaluate(() => document.querySelectorAll('style').forEach((s) => s.textContent.includes('transparent!important') && s.remove()));
  console.log('✔', name);
}
const card = (name, title, opts) => element(name, 'section.card', title, opts);

// ---------------- member ----------------
await login('ben@labrador.local');
await full('dashboard');
await element('dashboard-summary', 'header', 'The lab has', { pad: 24 });
await card('my-requests', 'Requests you filed');
await go('/requests/new');
await card('request-types', 'What kind of request?');
await clickText('Equipment maintenance');
await page.type('input[maxlength="200"]', 'Spectrophotometer readings drifting');
await page.type('textarea', 'Absorbance at 600 nm drifts ~0.02 over 10 minutes. Needed for growth curves on Friday.');
await clickText('High');
await setField('form select', String((await api('GET', '/equipment')).find((e) => e.name.includes('Spectro')).equipment_id));
await clickText('Submit request', 'button[type=submit]');
await sleep(1500);
const reqUrl = page.url();
const log = path.join(os.tmpdir(), 'instrument-log.txt');
fs.writeFileSync(log, '08:00 A600=0.412\n08:05 A600=0.421\n08:10 A600=0.433\n');
await page.type('textarea', 'Attaching the instrument log from this morning.');
await (await page.$('input[type=file]')).uploadFile(log);
await clickText('Comment', 'button[type=submit]');
await sleep(1200);
fs.rmSync(log);

// ---------------- staff ----------------
await login('somchai@labrador.local');
await card('staff-queue', 'Your queue');
await element('equipment-board', 'section:not(.card)', 'Equipment right now', { maxHeight: 900 });
await page.goto(reqUrl, { waitUntil: 'networkidle0' });
await sleep(1000);
await clickText('Pick up this request');
await sleep(1200);
await page.type('textarea', 'On it — recalibrating with the reference cuvettes this afternoon.');
await clickText('Comment', 'button[type=submit]');
await sleep(1500);
await card('discussion', 'Discussion', { maxHeight: 1100 });
await card('workflow', 'Workflow');
await login('ben@labrador.local');
await go('/notifications');
await card('notifications', '', { maxHeight: 620 });

// ---------------- admin ----------------
await login('admin@labrador.local');
const img = path.join(os.tmpdir(), 'microscope.png');
{
  const p = await browser.newPage();
  await p.setViewport({ width: 600, height: 400 });
  await p.setContent('<body style="margin:0;display:flex;align-items:center;justify-content:center;height:400px;background:linear-gradient(135deg,#d3e6e2,#f6e2bd);font-size:220px">🔬</body>');
  await p.screenshot({ path: img });
  await p.close();
}
await go('/equipment/1');
await clickText('Edit');
await sleep(500);
await (await page.$('.fixed input[type=file]')).uploadFile(img);
await clickText('Save changes', 'button[type=submit]');
await sleep(1200);
fs.rmSync(img);
await go('/equipment');
await full('equipment-catalog');

// booking commit + overlap rollback
await go('/equipment/1');
const t0 = new Date(Date.now() + 3 * 864e5); t0.setHours(14, 0, 0, 0);
const fmt = (d) => { const z = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}`; };
await page.type('input[placeholder="e.g. Thesis imaging run"]', 'Live-cell imaging');
await setField('input[type=datetime-local]', fmt(t0));
await setField('form .grid > label:nth-child(2) input', fmt(new Date(t0.getTime() + 2 * 3600e3)));
await clickText('Book time slot', 'button[type=submit]');
await sleep(5000);
await setField('input[type=datetime-local]', fmt(new Date(t0.getTime() + 3600e3)));
await setField('form .grid > label:nth-child(2) input', fmt(new Date(t0.getTime() + 3 * 3600e3)));
await clickText('Book time slot', 'button[type=submit]');
await sleep(5000);
await element('booking-rollback', 'div.card', 'Time slot overlaps', { wait: 200 });
await card('equipment-schedule', 'Schedule', { maxHeight: 820 });
await go('/maintenance');
await card('maintenance', 'Maintenance history', { maxHeight: 1000 });

// checkout: before / commit / after / rollbacks
await api('DELETE', '/cart');
const C = await api('GET', '/consumables');
const agarose = C.find((c) => c.name === 'Agarose');
const tips = C.find((c) => c.name.startsWith('Pipette Tips 200'));
await api('POST', '/cart/items', { consumableId: agarose.consumable_id, quantity: 1 });
await api('POST', '/cart/items', { consumableId: tips.consumable_id, quantity: 4 });
await go('/db');
await element('db-before', 'div.grid', 'MySQL 8', { maxHeight: 640 });
await go('/cart');
await card('cart', 'Items');
await clickText('Place order', 'button');
await sleep(4500);
await element('trace-commit', 'div.card', 'Transaction committed', { wait: 200 });
await go('/db');
await element('db-after', 'div.grid', 'MySQL 8', { maxHeight: 640 });
await api('POST', '/cart/items', { consumableId: agarose.consumable_id, quantity: 50 });
await go('/cart');
await element('cart-warning', 'div.rounded-md.border', 'exceeds current stock', { wait: 300 });
await clickText('Place order', 'button');
await sleep(4500);
await element('trace-insufficient', 'div.card', 'Insufficient stock', { wait: 200 });
await api('PATCH', `/cart/items/${agarose.consumable_id}`, { quantity: 1 });
await go('/cart');
await setLastSelect('after_sql_commit');
await clickText('Place order', 'button');
await sleep(4500);
await element('trace-compensate', 'div.card', 'COMPENSATE', { wait: 200 });

// insights
await go('/stats', 3000);
await card('chart-requests-week', 'Requests filed per week');
await card('chart-equipment-hours', 'Equipment hours booked', { wait: 2000 });

await browser.close();
console.log('done');
