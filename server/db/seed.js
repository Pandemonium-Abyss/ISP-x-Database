// Seeds MySQL + MongoDB with ~10 weeks of realistic lab activity.
// Usage: npm run migrate && npm run seed      (all accounts use password: password123)
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { pool } from '../src/config/mysql.js';
import { connectMongo } from '../src/config/mongo.js';
import {
  ActivityLog, RequestComment, Notification, ConsumableCart, MaintenanceLog, Announcement,
} from '../src/models/index.js';

// deterministic PRNG so every run produces the same data
let s = 42;
const rnd = () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
const pickOne = (a) => a[Math.floor(rnd() * a.length)];
const int = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));
const DAY = 864e5;
const now = Date.now();
const ago = (days, hours = 0) => new Date(now - days * DAY - hours * 36e5);
const hourAligned = (d) => { const x = new Date(d); x.setUTCMinutes(0, 0, 0); return x; };

const q = (sql, params) => pool.query(sql, params).then(([r]) => r);

async function main() {
  await connectMongo();
  console.log('Clearing existing data…');
  await q('SET FOREIGN_KEY_CHECKS = 0');
  for (const t of ['equipment_bookings', 'request_items', 'requests', 'consumables', 'equipment', 'users']) await q(`TRUNCATE TABLE ${t}`);
  await q('SET FOREIGN_KEY_CHECKS = 1');
  await Promise.all([ActivityLog, RequestComment, Notification, ConsumableCart, MaintenanceLog, Announcement].map((m) => m.deleteMany({})));
  await Promise.all([ActivityLog, RequestComment, Notification, ConsumableCart, MaintenanceLog, Announcement].map((m) => m.createCollection().catch(() => {})));
  await Promise.all([ActivityLog, RequestComment, Notification, ConsumableCart, MaintenanceLog, Announcement].map((m) => m.syncIndexes()));

  // ---------------- users ----------------
  const hash = await bcrypt.hash('password123', 10);
  const users = [
    ['admin@labrador.local', 'Dr. Kanya Wattana', 'admin', 70],
    ['somchai@labrador.local', 'Somchai Rattanakul', 'staff', 70],
    ['mali@labrador.local', 'Mali Chaiyaporn', 'staff', 68],
    ['ben@labrador.local', 'Ben Carter', 'member', 66],
    ['nicha@labrador.local', 'Nicha Thongdee', 'member', 60],
    ['arthit@labrador.local', 'Arthit Phromma', 'member', 55],
    ['sara@labrador.local', 'Sara Lindqvist', 'member', 40],
    ['ton@labrador.local', 'Ton Inthasorn', 'member', 12],
  ];
  for (const [email, name, role, d] of users) {
    await q('INSERT INTO users (email, password_hash, full_name, role, created_at) VALUES (?,?,?,?,?)', [email, hash, name, role, ago(d)]);
  }
  const U = Object.fromEntries((await q('SELECT user_id, email, full_name FROM users')).map((u) => [u.email.split('@')[0], u]));
  const staff = [U.somchai, U.mali];
  const members = [U.ben, U.nicha, U.arthit, U.sara, U.ton];
  const everyone = [U.admin, ...staff, ...members];

  // ---------------- equipment ----------------
  const equipment = [
    ['Confocal Microscope', 'Microscopy', 'Room 301', 'available', 'Laser scanning confocal, 4 laser lines. Training required.'],
    ['PCR Thermocycler #1', 'Molecular Biology', 'Room 204', 'available', '96-well gradient thermocycler.'],
    ['PCR Thermocycler #2', 'Molecular Biology', 'Room 204', 'maintenance', 'Lid heater fault reported — awaiting part.'],
    ['Refrigerated Centrifuge', 'Sample Prep', 'Room 204', 'available', 'Up to 15,000 rpm, 4 °C.'],
    ['-80 °C Freezer', 'Storage', 'Corridor B', 'in_use', 'Shared long-term sample storage. Racks labelled by group.'],
    ['UV-Vis Spectrophotometer', 'Analytical', 'Room 210', 'available', '190–1100 nm, cuvette and microvolume.'],
    ['Benchtop pH Meter', 'Analytical', 'Room 210', 'available', 'Calibrate daily before use.'],
    ['Biosafety Cabinet (Class II)', 'Sample Prep', 'Room 206', 'available', 'BSL-2 work only. UV cycle after use.'],
    ['Fume Hood A', 'Chemistry', 'Room 208', 'available', 'Face velocity checked monthly.'],
    ['FDM 3D Printer', 'Fabrication', 'Maker Bay', 'available', 'PLA / PETG, 250 × 210 × 210 mm.'],
    ['Digital Oscilloscope', 'Electronics', 'Room 112', 'available', '4-channel, 200 MHz.'],
    ['6-Axis Robot Arm', 'Robotics', 'Maker Bay', 'available', 'Research arm for automation projects. Supervisor sign-off required.'],
  ];
  for (const [name, category, location, status, description] of equipment) {
    await q('INSERT INTO equipment (name, category, location, status, description, created_at) VALUES (?,?,?,?,?,?)',
      [name, category, location, status, description, ago(70)]);
  }
  const E = await q('SELECT equipment_id, name, status FROM equipment ORDER BY equipment_id');

  // ---------------- consumables ----------------
  const consumables = [
    ['Nitrile Gloves (M)', 'box of 100', 42, 10, 6.5], ['Nitrile Gloves (L)', 'box of 100', 8, 10, 6.5],
    ['Pipette Tips 200 µL', 'rack of 96', 120, 30, 4.2], ['Pipette Tips 1000 µL', 'rack of 96', 25, 30, 4.8],
    ['Microcentrifuge Tubes 1.5 mL', 'bag of 500', 18, 5, 12.0], ['PCR Plates 96-well', 'pack of 10', 6, 4, 38.0],
    ['Agarose', '100 g', 3, 2, 55.0], ['Ethanol 70%', 'litre', 30, 10, 3.5], ['Petri Dishes 90 mm', 'sleeve of 20', 40, 10, 5.0],
    ['Cuvettes (PS)', 'pack of 100', 4, 5, 15.0], ['pH Buffer Kit (4/7/10)', 'kit', 2, 2, 28.0],
    ['PLA Filament', '1 kg spool', 9, 3, 22.0], ['Lab Wipes', 'box', 60, 15, 2.9], ['Parafilm', 'roll', 5, 2, 31.0],
    ['Solder Wire', '250 g reel', 7, 2, 18.0],
  ];
  for (const c of consumables) {
    await q('INSERT INTO consumables (name, unit, stock_quantity, reorder_level, unit_cost) VALUES (?,?,?,?,?)', c);
  }
  const C = await q('SELECT * FROM consumables ORDER BY consumable_id');

  // ---------------- requests (+ items, comments, logs) ----------------
  const templates = {
    experiment_setup: ['Set up time-lapse imaging run', 'Prepare cell culture for transfection', 'Configure PCR gradient protocol',
      'Arrange sensor rig for outdoor test', 'Book and prep BSL-2 session for new strain'],
    maintenance: ['Calibrate pH meter before thesis runs', 'Centrifuge making grinding noise', 'Replace HEPA filter in biosafety cabinet',
      'Thermocycler lid heater error E-12', '3D printer nozzle clogged', 'Fume hood airflow alarm keeps beeping'],
    access: ['Card access to Room 301 for new RA', 'Training sign-off for confocal microscope', 'Access to shared -80 freezer rack',
      'VPN access to instrument PC', 'After-hours access for Maker Bay'],
    ticket: ['Fix data export script for spectrophotometer', 'Instrument PC cannot reach network drive', 'Calibrate temperature sensor in incubator',
      'Update booking guide in lab wiki', 'Label printer out of ribbon', 'Oscilloscope probe compensation off'],
  };
  const statusesFor = (age) => (age > 21 ? ['resolved', 'closed', 'resolved', 'closed', 'in_progress']
    : age > 7 ? ['resolved', 'in_progress', 'waiting', 'open', 'closed'] : ['open', 'open', 'in_progress', 'waiting']);
  const priorities = ['low', 'medium', 'medium', 'medium', 'high', 'high', 'urgent'];
  const activity = [];
  const comments = [];
  const commentLines = [
    'Thanks — I can take a look this afternoon.', 'Could you share which protocol version you are using?',
    'Part has been ordered, ETA Thursday.', 'Done. Please confirm it works on your side.', 'Still seeing the issue after restart.',
    'Moved this to high priority since the thesis deadline is next week.', 'Added the instrument log export below.',
    'Training slot booked for Tuesday 10:00.', 'Works now, thank you!',
  ];

  let requestCount = 0;
  for (let i = 0; i < 46; i++) {
    const type = pickOne(['experiment_setup', 'maintenance', 'maintenance', 'access', 'ticket', 'ticket', 'consumables', 'consumables']);
    const age = int(0, 69);
    const created = ago(age, int(0, 9));
    const requester = pickOne(type === 'maintenance' && rnd() < 0.4 ? staff : members.filter((m) => (now - created) / DAY < 70));
    const status = pickOne(statusesFor(age));
    const priority = pickOne(priorities);
    const assignee = status === 'open' && rnd() < 0.6 ? null : pickOne(staff);
    const resolvedAt = ['resolved', 'closed'].includes(status) ? new Date(created.getTime() + int(2, 120) * 36e5) : null;
    const eq = ['maintenance', 'experiment_setup'].includes(type) || (type === 'ticket' && rnd() < 0.3) ? pickOne(E) : null;
    let title;
    if (type === 'consumables') title = `Consumables order for ${pickOne(['PCR week', 'teaching lab', 'thesis experiments', 'outreach day', 'prototype build'])}`;
    else title = pickOne(templates[type]);
    const res = await q(
      `INSERT INTO requests (requester_id, assignee_id, equipment_id, type, title, description, priority, status, due_date, resolved_at, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [requester.user_id, assignee?.user_id ?? null, eq?.equipment_id ?? null, type, title,
       `${title}. ${pickOne(['Needed for an upcoming experiment.', 'Reported by several members.', 'Blocking my thesis work.', 'Low urgency, whenever possible.', 'Industry partner visit next week.'])}`,
       priority, status, rnd() < 0.4 ? new Date(created.getTime() + int(3, 14) * DAY) : null, resolvedAt, created, resolvedAt || created]
    );
    const id = res.insertId;
    requestCount++;
    if (type === 'consumables') {
      const chosen = [...C].sort(() => rnd() - 0.5).slice(0, int(1, 4));
      for (const c of chosen) {
        await q('INSERT INTO request_items (request_id, consumable_id, quantity, unit_cost) VALUES (?,?,?,?)', [id, c.consumable_id, int(1, 5), c.unit_cost]);
      }
      activity.push({ userId: requester.user_id, userName: requester.full_name, action: 'order.submit', entity: { type: 'request', id }, metadata: { items: chosen.length }, timestamp: created });
    } else {
      activity.push({ userId: requester.user_id, userName: requester.full_name, action: 'request.create', entity: { type: 'request', id }, metadata: { type, priority }, timestamp: created });
    }
    if (assignee) activity.push({ userId: U.admin.user_id, userName: U.admin.full_name, action: 'request.update', entity: { type: 'request', id }, metadata: { changes: { assignee_id: { from: null, to: assignee.user_id } } }, timestamp: new Date(created.getTime() + 2 * 36e5) });
    if (resolvedAt) activity.push({ userId: assignee?.user_id, userName: assignee?.full_name, action: 'request.update', entity: { type: 'request', id }, metadata: { changes: { status: { from: 'in_progress', to: status } } }, timestamp: resolvedAt });
    const nComments = int(0, 3);
    for (let k = 0; k < nComments; k++) {
      const author = k % 2 === 0 && assignee ? assignee : requester;
      const at = new Date(created.getTime() + (k + 1) * int(1, 10) * 36e5);
      if (at > new Date()) break;
      comments.push({ requestId: id, userId: author.user_id, userName: author.full_name, body: pickOne(commentLines), createdAt: at,
        reactions: rnd() < 0.3 ? [{ userId: requester.user_id, emoji: '👍' }] : [] });
    }
  }
  await RequestComment.insertMany(comments);

  // ---------------- bookings (non-overlapping per equipment) ----------------
  const bookable = E.filter((e) => e.status !== 'maintenance' && e.name !== '-80 °C Freezer');
  let bookingCount = 0;
  for (const e of bookable) {
    let cursor = hourAligned(ago(68));
    while (cursor < new Date(now + 10 * DAY)) {
      cursor = new Date(cursor.getTime() + int(10, 72) * 36e5);
      const hours = int(1, 4);
      const start = cursor;
      const end = new Date(start.getTime() + hours * 36e5);
      const user = pickOne(members.concat(staff));
      const status = end < new Date() ? (rnd() < 0.1 ? 'cancelled' : 'completed') : 'booked';
      await q('INSERT INTO equipment_bookings (equipment_id, user_id, start_time, end_time, purpose, status, created_at) VALUES (?,?,?,?,?,?,?)',
        [e.equipment_id, user.user_id, start, end, pickOne(['Thesis experiment', 'Course practical', 'Pilot run', 'Industry project', 'Outreach demo prep']), status,
         new Date(start.getTime() - int(1, 5) * DAY)]);
      bookingCount++;
      activity.push({ userId: user.user_id, userName: user.full_name, action: 'booking.create', entity: { type: 'booking' }, metadata: { equipmentId: e.equipment_id }, timestamp: new Date(start.getTime() - 2 * DAY) });
      cursor = end;
    }
  }
  // one booking happening right now so the dashboard shows "in use by"
  await q('INSERT INTO equipment_bookings (equipment_id, user_id, start_time, end_time, purpose, status) VALUES (?,?,?,?,?,?)',
    [E[0].equipment_id, U.nicha.user_id, hourAligned(ago(0, 1)), hourAligned(new Date(now + 2 * 36e5)), 'Live-cell imaging', 'booked']).catch(() => {});

  // ---------------- maintenance logs (flexible readings) ----------------
  const readingsFor = (name) => {
    if (name.includes('pH')) return { slope_percent: +(95 + rnd() * 4).toFixed(1), offset_mV: int(-8, 8), buffers: [4.01, 7.0, 10.01] };
    if (name.includes('Centrifuge')) return { rpm_set: 15000, rpm_measured: int(14900, 15050), temp_c: +(3.5 + rnd()).toFixed(1) };
    if (name.includes('Fume')) return { face_velocity_mps: +(0.45 + rnd() * 0.15).toFixed(2), sash_height_cm: 40 };
    if (name.includes('Biosafety')) return { downflow_mps: +(0.3 + rnd() * 0.1).toFixed(2), hepa_pressure_pa: int(110, 140), uv_lamp_hours: int(800, 2000) };
    if (name.includes('Spectro')) return { wavelength_accuracy_nm: +(rnd() * 0.5).toFixed(2), stray_light_percent: +(rnd() * 0.05).toFixed(3) };
    if (name.includes('Freezer')) return { temp_c: int(-82, -78), alarm_test: 'pass', ice_buildup: rnd() < 0.3 ? 'moderate' : 'low' };
    if (name.includes('Printer')) return { nozzle_temp_c: 210, bed_level_mm: [0.02, -0.01, 0.03, 0.0], hours_printed: int(300, 900) };
    if (name.includes('Thermocycler')) return { block_uniformity_c: +(rnd() * 0.4).toFixed(2), lid_temp_c: 105 };
    return { visual_check: 'ok' };
  };
  const mlogs = [];
  for (const e of E) {
    for (let k = 0; k < int(1, 3); k++) {
      const at = ago(int(1, 65));
      const by = pickOne(staff);
      mlogs.push({ equipmentId: e.equipment_id, performedBy: by.user_id, performedByName: by.full_name,
        kind: pickOne(['calibration', 'inspection', 'cleaning', 'repair']), notes: pickOne(['Routine check, within spec.', 'Adjusted and re-tested.', 'Replaced worn part.', 'Cleaned and logged.']),
        readings: readingsFor(e.name), performedAt: at, nextDueAt: new Date(at.getTime() + 30 * DAY) });
      activity.push({ userId: by.user_id, userName: by.full_name, action: 'maintenance.create', entity: { type: 'equipment', id: e.equipment_id }, metadata: {}, timestamp: at });
    }
  }
  await MaintenanceLog.insertMany(mlogs);

  // ---------------- announcements ----------------
  await Announcement.insertMany([
    { authorId: U.admin.user_id, authorName: U.admin.full_name, title: 'Welcome to Labrador — start here', pinned: true, tags: ['onboarding'], audience: 'all', createdAt: ago(30),
      body: 'All lab requests now go through Labrador instead of email. New members: complete safety induction, then request access via "New request → Access". Book shared instruments under Equipment.' },
    { authorId: U.somchai.user_id, authorName: U.somchai.full_name, title: 'PCR Thermocycler #2 out of service', pinned: true, tags: ['equipment'], audience: 'all', createdAt: ago(3),
      body: 'Lid heater fault — replacement part ordered. Please use Thermocycler #1 and book early this week.' },
    { authorId: U.mali.user_id, authorName: U.mali.full_name, title: 'Outreach day volunteers needed', pinned: false, tags: ['outreach', 'events'], audience: 'all', createdAt: ago(9),
      body: 'We are hosting high-school visitors on Friday. Sign up by commenting on request "Outreach day prep".' },
    { authorId: U.admin.user_id, authorName: U.admin.full_name, title: 'Monthly consumables budget reset', pinned: false, tags: ['consumables'], audience: 'staff', createdAt: ago(20),
      body: 'Staff: the consumables budget resets on the 1st. Review low-stock items on the dashboard before ordering.' },
  ]);

  // ---------------- notifications ----------------
  const notes = [];
  for (const u of everyone) {
    notes.push({ userId: u.user_id, type: 'info', title: 'Welcome to Labrador 🐾', message: 'Your lab requests, bookings and orders now live here.', link: '/', isRead: true, sentAt: ago(30) });
    notes.push({ userId: u.user_id, type: 'announcement', title: '📣 PCR Thermocycler #2 out of service', message: 'Please use Thermocycler #1.', link: '/announcements', isRead: false, sentAt: ago(3) });
  }
  notes.push({ userId: U.ben.user_id, type: 'request', title: 'Request is now in progress', message: 'Somchai picked up your ticket.', link: '/requests', isRead: false, sentAt: ago(1) });
  notes.push({ userId: U.somchai.user_id, type: 'request', title: 'New urgent maintenance request', message: 'Fume hood airflow alarm keeps beeping', link: '/requests', isRead: false, sentAt: ago(0, 5) });
  await Notification.insertMany(notes);

  // ---------------- a cart in progress ----------------
  await ConsumableCart.create({ userId: U.ben.user_id, items: [
    { consumableId: C[2].consumable_id, name: C[2].name, unit: C[2].unit, quantity: 2 },
    { consumableId: C[0].consumable_id, name: C[0].name, unit: C[0].unit, quantity: 1 },
  ], updatedAt: ago(0, 3) });

  // ---------------- activity logs ----------------
  for (let d = 0; d < 70; d++) {
    for (let k = 0; k < int(1, 4); k++) {
      const u = pickOne(everyone);
      activity.push({ userId: u.user_id, userName: u.full_name, action: 'user.login', entity: { type: 'user', id: u.user_id }, ip: `10.0.${int(0, 3)}.${int(2, 250)}`, metadata: {}, timestamp: ago(d, int(0, 10)) });
    }
  }
  await ActivityLog.insertMany(activity.map((a) => ({ ip: '10.0.1.24', ...a })));

  console.log(`✔ MySQL: ${users.length} users, ${E.length} equipment, ${C.length} consumables, ${requestCount} requests, ${bookingCount + 1} bookings`);
  console.log(`✔ MongoDB: ${activity.length} activity logs, ${comments.length} comments, ${mlogs.length} maintenance logs, ${notes.length} notifications, 4 announcements, 1 cart`);
  console.log('Login with admin@labrador.local / somchai@labrador.local (staff) / ben@labrador.local (member) — password: password123');
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(async () => { await pool.end(); await mongoose.disconnect(); });
