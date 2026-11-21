# Labrador — presentation outline (10 slides, ~10 min video)

Target: **~10 minutes, hard limit 12**. Timings below add up to ~10:00.
Due 23 Nov (video link in README), presented 24 Nov.

| # | Slide | Time | Key points to say | Visual |
|---|---|---|---|---|
| 1 | **Labrador — Lab Operations Hub** | 0:20 | Team, one-line pitch: "every lab request, booking and order in one place, not lost in email" | Logo + dashboard screenshot (04) |
| 2 | **The problem** | 0:50 | Lab grew: student projects, experiments, industry, outreach. Requests via email/chat/spreadsheets → lost requests, unclear priority, no follow-up, no visibility of resource use, new members lost | Messy-inbox illustration; 5 pain points |
| 3 | **Our solution** | 0:50 | Request queue with type/priority/status/assignee · equipment booking without double-booking · consumables inventory + cart · threads & notifications · dashboard + insights · roles member/staff/admin | Problem → solution table (README §1) |
| 4 | **Databases 101: SQL vs NoSQL** | 1:00 | DB = organised persistent data + DBMS. SQL: tables, fixed schema, keys, joins, ACID transactions. NoSQL (document): JSON-like documents, flexible schema, embedded arrays, scales for high-volume writes. Neither is "better" — they fit different data | Two-column comparison |
| 5 | **Architecture** | 0:40 | React SPA → Express API → MySQL + MongoDB, files on local disk, everything self-hosted in Docker; no external APIs/CDN/cloud DB | Diagram 35 |
| 6 | **SQL design (6 tables)** | 0:50 | Why relational: stock, bookings, ownership must be consistent. PK/FK (CASCADE / SET NULL / RESTRICT), UNIQUE, CHECK (stock ≥ 0, end > start), `request_items` junction, joins for lists | ER diagram 36 |
| 7 | **NoSQL design (6 collections)** | 0:50 | Why documents: activity logs with varying metadata, comment threads with embedded attachments/reactions, cart with items array, maintenance readings that differ per instrument (pH vs centrifuge). Reference SQL IDs, denormalise names | Diagram 37 + one real `maintenance_logs` doc |
| 8 | **Transactions & rollback** | 1:00 | ACID. Checkout: SQL BEGIN → FOR UPDATE → verify → deduct → insert → COMMIT; then Mongo transaction (replica set) clear cart/log/notify. Failure → ROLLBACK / abort + compensating SQL txn. Booking: row lock + overlap check | Sequence diagram 38 |
| 9 | **Live demo** | 3:00 | See demo script below | Screen recording |
| 10 | **Results & lessons** | 0:40 | 12 entities with full CRUD, 3 transactional workflows, 59 automated checks pass, 38 screenshots. Lessons: pick the store per data shape; cross-DB consistency needs compensation; row locks prevent race conditions. Future: email digests, calendar view, QR codes on equipment | Checklist vs requirements |

## Demo script (≈3 min)

1. **Member view** (`ben@labrador.local`) — dashboard: open requests, equipment status, announcements, recent activity. *(15 s)*
2. **New request** → Equipment maintenance, High, link Spectrophotometer → submit. Show it on the detail page; post a comment with an attachment (MongoDB + local file). *(30 s)*
3. **Staff view** (`somchai@…`) — staff queue → open the request → "Pick up" (status + assignee update) → member gets a notification. *(25 s)*
4. **Booking** — Equipment → Confocal Microscope → book a slot (trace shows COMMIT). Book an overlapping slot → **ROLLBACK** with the conflicting booking named. *(25 s)*
5. **Checkout transaction** (`admin@…`) — open *Database inspector* (note counts + stock) → Consumables → add 2 items → Cart → Place order → trace shows MySQL COMMIT then Mongo commit; inspector shows stock reduced, +1 request, +2 items, cart empty. *(35 s)*
6. **Rollbacks** — order more than in stock → ROLLBACK, cart kept. Select "Fail after stock deduction" → ROLLBACK. Select "Fail in MongoDB phase" → abort + compensation. Inspector: counts unchanged. *(40 s)*
7. **Insights** — Usage page: requests per week by type, equipment hours, consumables spend, activity per day (SQL GROUP BY + Mongo $group). *(10 s)*

## Recording tips
* Run `npm run reset` right before recording so data and IDs are predictable.
* Use 1440 × 900 browser window, zoom 100 %, hide bookmarks bar.
* Keep the terminal with `npm run dev` hidden; show `docker compose ps` once in slide 5 to prove both DBs run locally.
