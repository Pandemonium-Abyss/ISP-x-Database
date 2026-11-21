// End-to-end CRUD + transaction smoke test against a running API.
// Usage: npm run seed && npm test     (API must be running on $API or http://localhost:4000)
const API = process.env.API || 'http://localhost:4000/api';
let cookie = '';
let passed = 0;
const failures = [];

async function call(method, path, body, { form } = {}) {
  const headers = { cookie };
  let payload;
  if (form) payload = form;
  else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  const res = await fetch(API + path, { method, headers, body: payload });
  const set = res.headers.get('set-cookie');
  if (set) cookie = set.split(';')[0];
  const text = await res.text();
  return { status: res.status, data: text ? JSON.parse(text) : null };
}
async function check(name, fn) {
  try { await fn(); passed++; console.log(`  ✔ ${name}`); }
  catch (e) { failures.push(name); console.log(`  ✘ ${name}: ${e.message}`); }
}
function expect(cond, msg) { if (!cond) throw new Error(msg); }
const ok = (r, code = 200) => expect(r.status === code, `expected ${code}, got ${r.status} ${JSON.stringify(r.data)}`);

const PNG = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000' +
  '1f15c4890000000d49444154789c6360f8cf000000030101006f5b2d0b0000000049454e44ae426082', 'hex');

async function main() {
  console.log('Auth');
  await check('login as admin', async () => ok(await call('POST', '/auth/login', { email: 'admin@labrador.local', password: 'password123' })));

  console.log('SQL · users');
  let uid;
  await check('create', async () => { const r = await call('POST', '/users', { email: `t${Date.now()}@x.io`, password: 'secret1', full_name: 'Test User' }); ok(r, 201); uid = r.data.user_id; });
  await check('read', async () => { const r = await call('GET', '/users'); ok(r); expect(r.data.some((u) => u.user_id === uid), 'not listed'); });
  await check('update role', async () => { const r = await call('PATCH', `/users/${uid}`, { role: 'staff' }); ok(r); expect(r.data.role === 'staff', 'role'); });
  await check('upload avatar (local file)', async () => {
    const fd = new FormData(); fd.append('avatar', new Blob([PNG], { type: 'image/png' }), 'a.png');
    const r = await call('POST', '/users/me/avatar', undefined, { form: fd }); ok(r);
    expect((await fetch(API.replace('/api', '') + r.data.avatar_path)).status === 200, 'file not served');
  });
  await check('delete', async () => ok(await call('DELETE', `/users/${uid}`)));

  console.log('SQL · equipment');
  let eid;
  await check('create with image', async () => {
    const fd = new FormData(); fd.append('name', 'Test Rig'); fd.append('category', 'Test'); fd.append('location', 'Lab');
    fd.append('image', new Blob([PNG], { type: 'image/png' }), 'rig.png');
    const r = await call('POST', '/equipment', undefined, { form: fd }); ok(r, 201); eid = r.data.equipment_id;
    expect(r.data.image_path?.startsWith('/uploads/equipment/'), 'image path');
  });
  await check('read (joined detail)', async () => { const r = await call('GET', `/equipment/${eid}`); ok(r); expect(Array.isArray(r.data.bookings), 'bookings'); });
  await check('update status', async () => { const r = await call('PATCH', `/equipment/${eid}`, { status: 'maintenance' }); ok(r); expect(r.data.status === 'maintenance', 'status'); });

  console.log('SQL · equipment_bookings (transaction)');
  let bid;
  await check('reject booking on maintenance equipment', async () => { const r = await call('POST', '/bookings', { equipment_id: eid, start_time: '2027-01-05T09:00:00Z', end_time: '2027-01-05T10:00:00Z' }); ok(r, 409); });
  await call('PATCH', `/equipment/${eid}`, { status: 'available' });
  await check('create', async () => { const r = await call('POST', '/bookings', { equipment_id: eid, start_time: '2027-01-05T09:00:00Z', end_time: '2027-01-05T11:00:00Z' }); ok(r, 201); bid = r.data.bookingId; });
  await check('reject overlap (ROLLBACK)', async () => { const r = await call('POST', '/bookings', { equipment_id: eid, start_time: '2027-01-05T10:00:00Z', end_time: '2027-01-05T12:00:00Z' }); ok(r, 409); expect(r.data.trace.at(-1).step === 'ROLLBACK', 'no rollback'); });
  await check('simulated failure rolls back insert', async () => {
    const before = (await call('GET', '/db-state')).data.mysql.equipment_bookings;
    const r = await call('POST', '/bookings', { equipment_id: eid, start_time: '2027-02-01T09:00:00Z', end_time: '2027-02-01T10:00:00Z', simulateFailure: 'after_booking_insert' }); ok(r, 500);
    expect((await call('GET', '/db-state')).data.mysql.equipment_bookings === before, 'row leaked');
  });
  await check('read', async () => { const r = await call('GET', `/bookings?scope=all&equipmentId=${eid}`); ok(r); expect(r.data.length === 1, 'count'); });
  await check('update (reschedule)', async () => ok(await call('PATCH', `/bookings/${bid}`, { start_time: '2027-01-06T09:00:00Z', end_time: '2027-01-06T10:00:00Z' })));
  await check('update (cancel)', async () => ok(await call('PATCH', `/bookings/${bid}`, { status: 'cancelled' })));
  await check('delete', async () => ok(await call('DELETE', `/bookings/${bid}`)));

  console.log('MongoDB · maintenance_logs');
  let mid;
  await check('create with flexible readings', async () => { const r = await call('POST', '/maintenance', { equipmentId: eid, kind: 'calibration', readings: { offset_mV: -2, ok: 'yes' } }); ok(r, 201); mid = r.data._id; expect(r.data.readings.offset_mV === -2, 'readings'); });
  await check('read', async () => { const r = await call('GET', `/maintenance?equipmentId=${eid}`); ok(r); expect(r.data.length === 1, 'count'); });
  await check('update', async () => ok(await call('PATCH', `/maintenance/${mid}`, { notes: 'edited', readings: { slope: 99.1 } })));
  await check('delete', async () => ok(await call('DELETE', `/maintenance/${mid}`)));
  await check('delete equipment (SQL)', async () => ok(await call('DELETE', `/equipment/${eid}`)));

  console.log('SQL · consumables');
  let cid;
  await check('create', async () => { const r = await call('POST', '/consumables', { name: `Test Tips ${Date.now()}`, unit: 'box', stock_quantity: 5, reorder_level: 1, unit_cost: 2 }); ok(r, 201); cid = r.data.consumable_id; });
  await check('read', async () => { const r = await call('GET', '/consumables'); ok(r); expect(r.data.some((c) => c.consumable_id === cid), 'listed'); });
  await check('update stock', async () => { const r = await call('PATCH', `/consumables/${cid}`, { stock_quantity: 4 }); ok(r); expect(r.data.stock_quantity === 4, 'stock'); });
  await check('CHECK constraint rejects negative stock', async () => ok(await call('PATCH', `/consumables/${cid}`, { stock_quantity: -1 }), 400));

  console.log('MongoDB · consumable_carts');
  await call('DELETE', '/cart');
  await check('create (add item)', async () => { const r = await call('POST', '/cart/items', { consumableId: cid, quantity: 3 }); ok(r, 201); expect(r.data.items[0].quantity === 3, 'qty'); });
  await check('read', async () => ok(await call('GET', '/cart')));
  await check('update quantity', async () => { const r = await call('PATCH', `/cart/items/${cid}`, { quantity: 9 }); ok(r); expect(r.data.items[0].quantity === 9, 'qty'); });

  console.log('Hybrid checkout transaction');
  await check('insufficient stock → ROLLBACK, stock unchanged, cart kept', async () => {
    const r = await call('POST', '/cart/checkout', {}); ok(r, 409);
    expect(r.data.stockAfter[0].stock_quantity === 4, 'stock changed');
    expect((await call('GET', '/cart')).data.items.length === 1, 'cart lost');
  });
  await call('PATCH', `/cart/items/${cid}`, { quantity: 2 });
  await check('fail after stock deduct → ROLLBACK', async () => {
    const r = await call('POST', '/cart/checkout', { simulateFailure: 'after_stock_deduct' }); ok(r, 500);
    expect(r.data.stockAfter[0].stock_quantity === 4, 'stock leaked');
  });
  await check('fail in Mongo phase → abort + compensation', async () => {
    const before = (await call('GET', '/db-state')).data;
    const r = await call('POST', '/cart/checkout', { simulateFailure: 'after_sql_commit' }); ok(r, 500);
    const after = (await call('GET', '/db-state')).data;
    expect(after.mysql.requests === before.mysql.requests, 'request leaked');
    expect(after.mongodb.notifications === before.mongodb.notifications, 'notification leaked');
    expect(r.data.stockAfter[0].stock_quantity === 4, 'stock not restored');
  });
  let rid;
  await check('success → COMMIT in both DBs', async () => {
    const r = await call('POST', '/cart/checkout', { priority: 'high' }); ok(r, 201); rid = r.data.requestId;
    expect(r.data.stockAfter[0].stock_quantity === 2, 'stock not deducted');
    expect((await call('GET', '/cart')).data.items.length === 0, 'cart not cleared');
  });

  console.log('SQL · requests + request_items');
  let iid;
  await check('read (joined)', async () => { const r = await call('GET', `/requests/${rid}`); ok(r); iid = r.data.items[0].item_id; expect(r.data.requester_name, 'join'); });
  await check('update request_item qty (stock adjusted)', async () => ok(await call('PATCH', `/requests/${rid}/items/${iid}`, { quantity: 1 })));
  await check('delete request_item (stock restored)', async () => {
    ok(await call('DELETE', `/requests/${rid}/items/${iid}`));
    const c = (await call('GET', '/consumables')).data.find((x) => x.consumable_id === cid);
    expect(c.stock_quantity === 4, `stock ${c.stock_quantity}`);
  });
  await check('FK RESTRICT protects consumable used in an order', async () => {
    const r2 = await call('POST', '/cart/items', { consumableId: cid, quantity: 1 }); ok(r2, 201);
    const o = await call('POST', '/cart/checkout', {}); ok(o, 201);
    ok(await call('DELETE', `/consumables/${cid}`), 409);
    ok(await call('DELETE', `/requests/${o.data.requestId}`));
  });
  await check('delete consumable', async () => ok(await call('DELETE', `/consumables/${cid}`)));
  let tid;
  await check('create ticket', async () => { const r = await call('POST', '/requests', { type: 'ticket', title: 'Smoke test ticket', priority: 'low' }); ok(r, 201); tid = r.data.request_id; });
  await check('list with filters', async () => { const r = await call('GET', '/requests?type=ticket&priority=low'); ok(r); expect(r.data.some((x) => x.request_id === tid), 'filter'); });
  await check('update status/assignee', async () => { const r = await call('PATCH', `/requests/${tid}`, { status: 'resolved', assignee_id: 1 }); ok(r); expect(r.data.resolved_at, 'resolved_at'); });

  console.log('MongoDB · request_comments');
  let cmid;
  await check('create with attachment', async () => {
    const fd = new FormData(); fd.append('body', 'hello'); fd.append('files', new Blob(['log line'], { type: 'text/plain' }), 'log.txt');
    const r = await call('POST', `/requests/${tid}/comments`, undefined, { form: fd }); ok(r, 201); cmid = r.data._id; expect(r.data.attachments.length === 1, 'attachment');
  });
  await check('read', async () => { const r = await call('GET', `/requests/${tid}/comments`); ok(r); expect(r.data.length === 1, 'count'); });
  await check('update', async () => ok(await call('PATCH', `/comments/${cmid}`, { body: 'edited' })));
  await check('react ($push array)', async () => { const r = await call('POST', `/comments/${cmid}/react`, { emoji: '👍' }); ok(r); expect(r.data.reactions.length === 1, 'reaction'); });
  await check('delete', async () => ok(await call('DELETE', `/comments/${cmid}`)));
  await check('delete request', async () => ok(await call('DELETE', `/requests/${tid}`)));

  console.log('MongoDB · announcements');
  let aid;
  await check('create', async () => { const r = await call('POST', '/announcements', { title: 'Smoke', body: 'test', tags: 'a,b' }); ok(r, 201); aid = r.data._id; });
  await check('read', async () => ok(await call('GET', '/announcements')));
  await check('update (pin)', async () => { const r = await call('PATCH', `/announcements/${aid}`, { pinned: true }); ok(r); expect(r.data.pinned, 'pin'); });
  await check('delete', async () => ok(await call('DELETE', `/announcements/${aid}`)));

  console.log('MongoDB · notifications');
  let nid;
  await check('read', async () => { const r = await call('GET', '/notifications'); ok(r); nid = r.data.items[0]._id; });
  await check('update (mark read)', async () => { const r = await call('PATCH', `/notifications/${nid}/read`, { isRead: true }); ok(r); expect(r.data.isRead, 'read'); });
  await check('update all read', async () => ok(await call('POST', '/notifications/read-all')));
  await check('delete (dismiss)', async () => ok(await call('DELETE', `/notifications/${nid}`)));

  console.log('MongoDB · activity_logs');
  let lid;
  await check('read with filter', async () => { const r = await call('GET', '/activity?action=order'); ok(r); lid = r.data.items[0]._id; expect(r.data.items.every((l) => l.action.startsWith('order')), 'filter'); });
  await check('update (annotate)', async () => ok(await call('PATCH', `/activity/${lid}`, { adminNote: 'checked' })));
  await check('delete (purge)', async () => ok(await call('DELETE', `/activity/${lid}`)));
  await check('cart delete (clear)', async () => ok(await call('DELETE', '/cart')));

  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length) process.exit(1);
}
main();
