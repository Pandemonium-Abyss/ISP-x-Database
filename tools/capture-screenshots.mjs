// Captures docs/screenshots/*.png by driving the running app in headless Chrome.
// Prereqs: databases up, `npm run reset` (fresh seed), `npm run dev` running (web on :5173).
// Usage: npm run docs:screenshots
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import puppeteer from 'puppeteer-core';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = path.join(root, 'docs/screenshots');
const WEB = process.env.WEB || 'http://localhost:5173';
const chrome = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
fs.mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({ executablePath: chrome, headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
page.on('dialog', (d) => d.dismiss());
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function shot(name, { full = false, wait = 900 } = {}) {
  await sleep(wait);
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: full });
  console.log('✔', name);
}
async function go(p, wait = 1200) { await page.goto(WEB + p, { waitUntil: 'networkidle0' }); await sleep(wait); }
async function api(method, url, body) {
  return page.evaluate(async (m, u, b) => {
    const r = await fetch('/api' + u, { method: m, headers: b ? { 'Content-Type': 'application/json' } : {}, body: b ? JSON.stringify(b) : undefined });
    return r.json();
  }, method, url, body);
}
async function clickText(text, sel = 'button, a') {
  const handles = await page.$$(sel);
  for (const h of handles) {
    const t = await h.evaluate((el) => el.textContent.trim());
    if (t.includes(text)) { await h.click(); return; }
  }
  throw new Error(`No element with text "${text}"`);
}
async function setField(selector, value) {
  await page.evaluate((s, v) => {
    const el = document.querySelector(s);
    const proto = el.tagName === 'SELECT' ? HTMLSelectElement.prototype : el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
    el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
  }, selector, value);
}
async function login(email) {
  await page.deleteCookie(...(await page.cookies()));
  await go('/login', 400);
  await page.type('input[type=email]', email);
  await page.type('input[type=password]', 'password123');
  await clickText('Sign in', 'button[type=submit]');
  await page.waitForNavigation({ waitUntil: 'networkidle0' }).catch(() => {});
  await sleep(1000);
}
async function makeImage(file, emoji, bg) {
  const p = await browser.newPage();
  await p.setViewport({ width: 600, height: 400 });
  await p.setContent(`<body style="margin:0;display:flex;align-items:center;justify-content:center;height:400px;background:${bg};font-size:220px">${emoji}</body>`);
  await p.screenshot({ path: file });
  await p.close();
}

// ---------- public pages ----------
await go('/login', 600);
await shot('01-login');
await go('/register', 400);
await page.type('input:not([type=email]):not([type=password])', 'Pim Kittisak');
await page.type('input[type=email]', `pim.${Date.now() % 10000}@labrador.local`);
await page.type('input[type=password]', 'password123');
await shot('02-register-form', { wait: 300 });
await clickText('Create account', 'button[type=submit]');
await sleep(1500);
await shot('03-dashboard-new-member');

// ---------- member view ----------
await login('ben@labrador.local');
await shot('04-dashboard-member');
await go('/requests/new');
await clickText('Equipment maintenance');
await page.type('input[maxlength="200"]', 'Spectrophotometer readings drifting');
await page.type('textarea', 'Absorbance at 600 nm drifts ~0.02 over 10 minutes. Needed for growth curves on Friday.');
await clickText('High');
await setField('form select', String((await api('GET', '/equipment')).find((e) => e.name.includes('Spectro')).equipment_id));
await shot('05-new-request-form');
await clickText('Submit request', 'button[type=submit]');
await sleep(1500);
await shot('06-request-created-detail');
const fd = await page.$('textarea');
await fd.type('Attaching the instrument log from this morning.');
const tmpLog = path.join(os.tmpdir(), 'instrument-log.txt');
fs.writeFileSync(tmpLog, '08:00 A600=0.412\n08:05 A600=0.421\n08:10 A600=0.433\n');
await (await page.$('input[type=file]')).uploadFile(tmpLog);
await clickText('Comment', 'button[type=submit]');
await sleep(1200);
fs.rmSync(tmpLog);
await shot('07-request-comment-with-attachment', { full: true });

// ---------- staff view ----------
await login('somchai@labrador.local');
await shot('08-dashboard-staff-queue');
await go('/requests');
await shot('09-requests-list-joins');
const latest = (await api('GET', '/requests?mine=0&type=maintenance'))[0];
await go(`/requests/${latest.request_id}`);
await clickText('Pick up this request');
await sleep(1200);
await page.type('textarea', 'On it — will recalibrate with the reference cuvettes this afternoon.');
await clickText('Comment', 'button[type=submit]');
await shot('10-request-picked-up-by-staff', { wait: 1500 });

// ---------- admin: equipment CRUD + local image upload ----------
await login('admin@labrador.local');
const img = path.join(os.tmpdir(), 'microscope.png');
await makeImage(img, '🔬', 'linear-gradient(135deg,#d3e6e2,#f6e2bd)');
await go('/equipment/1');
await clickText('Edit');
await sleep(500);
await (await page.$('.fixed input[type=file]')).uploadFile(img);
await shot('11-equipment-edit-image-upload', { wait: 600 });
await clickText('Save changes', 'button[type=submit]');
await sleep(1200);
fs.rmSync(img);
await go('/equipment');
await shot('12-equipment-catalog');
await go('/equipment/1');
await shot('13-equipment-detail-schedule', { full: true });

// booking success + overlap rollback
const t0 = new Date(Date.now() + 3 * 864e5); t0.setHours(14, 0, 0, 0);
const fmt = (d) => { const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };
await setField('input[type=datetime-local]', fmt(t0));
await setField('form .grid > label:nth-child(2) input', fmt(new Date(t0.getTime() + 2 * 3600e3)));
await clickText('Book time slot', 'button[type=submit]');
await shot('14-booking-transaction-commit', { wait: 1300, full: true });
await setField('input[type=datetime-local]', fmt(new Date(t0.getTime() + 3600e3)));
await setField('form .grid > label:nth-child(2) input', fmt(new Date(t0.getTime() + 3 * 3600e3)));
await clickText('Book time slot', 'button[type=submit]');
await shot('15-booking-overlap-rollback', { wait: 5000, full: true });
await go('/bookings');
await shot('16-bookings-list');

// maintenance log with flexible readings
await go('/maintenance');
await shot('17-maintenance-logs-flexible-readings');

// consumables CRUD
await go('/consumables');
await shot('18-consumables-inventory');
const rows = await page.$$('tbody tr');
await (await rows[1].$$('button'))[1].click(); // edit "Nitrile Gloves (L)"
await sleep(500);
await shot('19-consumable-edit-stock-modal', { wait: 300 });
await page.keyboard.press('Escape');

// ---------- transaction proof: success ----------
await api('DELETE', '/cart');
const C = await api('GET', '/consumables');
const agarose = C.find((c) => c.name === 'Agarose');
const tips = C.find((c) => c.name.startsWith('Pipette Tips 200'));
await api('POST', '/cart/items', { consumableId: agarose.consumable_id, quantity: 1 });
await api('POST', '/cart/items', { consumableId: tips.consumable_id, quantity: 4 });
await go('/db');
await shot('20-db-state-before-checkout');
await go('/cart');
await shot('21-cart-mongodb');
await clickText('Place order', 'button');
await shot('22-checkout-success-commit-trace', { wait: 5000, full: true });
await go('/db');
await shot('23-db-state-after-checkout');

// ---------- rollback scenarios ----------
await api('POST', '/cart/items', { consumableId: agarose.consumable_id, quantity: 50 });
await go('/cart');
await clickText('Place order', 'button');
await shot('24-rollback-insufficient-stock', { wait: 1500, full: true });
await api('PATCH', `/cart/items/${agarose.consumable_id}`, { quantity: 1 });
await go('/cart');
const lastSelect = async (v) => { const sels = await page.$$('select'); await sels[sels.length - 1].select(v); await sleep(300); };
await lastSelect('after_stock_deduct');
await clickText('Place order', 'button');
await shot('25-rollback-simulated-sql-failure', { wait: 4500, full: true });
await lastSelect('after_sql_commit');
await clickText('Place order', 'button');
await shot('26-rollback-mongo-abort-and-compensation', { wait: 4500, full: true });
await go('/db');
await shot('27-db-state-after-rollbacks');

// request with items (request_items join) + order history
const order = (await api('GET', '/requests?type=consumables&mine=1'))[0];
await go(`/requests/${order.request_id}`);
await shot('28-order-request-items-join');

// ---------- NoSQL features ----------
await go('/notifications');
await shot('29-notifications');
await go('/announcements');
await shot('30-announcements');
await go('/activity');
await shot('31-activity-log');
await go('/stats', 2500);
await shot('32-usage-insights', { full: true });
await go('/users');
await shot('33-users-admin');

// profile + avatar upload (local storage)
const av = path.join(os.tmpdir(), 'avatar.png');
await makeImage(av, '🧪', '#f6e2bd');
await go('/profile');
await (await page.$('input[type=file]')).uploadFile(av);
await shot('34-profile-avatar-upload', { wait: 1500 });
fs.rmSync(av);

await browser.close();
console.log('done');
