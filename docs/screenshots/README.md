# Screenshots

## SQL features (MySQL)

| #   | Screenshot                                                   | What it shows                                                                            |
| --- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| 01  | [Login](01-login.png)                                        | Sign-in page with demo accounts                                                          |
| 02  | [Register form](02-register-form.png)                        | **Create** `users` — self-registration                                                   |
| 03  | [New member dashboard](03-dashboard-new-member.png)          | Freshly created account lands on the dashboard (welcome notification written to MongoDB) |
| 04  | [Member dashboard](04-dashboard-member.png)                  | Open requests, equipment status board, announcements, recent activity                    |
| 05  | [New request form](05-new-request-form.png)                  | **Create** `requests` (type, priority, equipment FK)                                     |
| 06  | [Request detail](06-request-created-detail.png)              | **Read** `requests` ⨝ `users` ⨝ `equipment`                                              |
| 08  | [Staff queue](08-dashboard-staff-queue.png)                  | Unassigned / assigned-to-me queue sorted by priority                                     |
| 09  | [Requests list](09-requests-list-joins.png)                  | Filterable list built from a 4-table join                                                |
| 10  | [Picked up by staff](10-request-picked-up-by-staff.png)      | **Update** `requests.assignee_id` + `status`                                             |
| 11  | [Edit equipment + image](11-equipment-edit-image-upload.png) | **Update** `equipment`, photo stored in `server/uploads/equipment`                       |
| 12  | [Equipment catalog](12-equipment-catalog.png)                | **Read** `equipment` with booking/request counts (subqueries)                            |
| 13  | [Equipment detail](13-equipment-detail-schedule.png)         | Schedule from `equipment_bookings ⨝ users`                                               |
| 16  | [Bookings list](16-bookings-list.png)                        | **Read / Update (reschedule, cancel) / Delete** `equipment_bookings`                     |
| 18  | [Consumables inventory](18-consumables-inventory.png)        | **Read** `consumables` with low-stock flag and 30-day usage join                         |
| 19  | [Edit stock](19-consumable-edit-stock-modal.png)             | **Update** inventory modification                                                        |
| 28  | [Order with line items](28-order-request-items-join.png)     | Order history: `request_items ⨝ consumables`, edit qty / remove line                     |
| 33  | [Lab members](33-users-admin.png)                            | **Read / Update role / Delete** `users`                                                  |
| 34  | [Profile avatar](34-profile-avatar-upload.png)               | **Update** profile, avatar saved to local disk                                           |

## NoSQL features (MongoDB)

| #   | Screenshot                                                        | Collection                                                                 |
| --- | ----------------------------------------------------------------- | -------------------------------------------------------------------------- |
| 07  | [Comment with attachment](07-request-comment-with-attachment.png) | `request_comments` — threaded discussion, local file attachment, reactions |
| 17  | [Maintenance logs](17-maintenance-logs-flexible-readings.png)     | `maintenance_logs` — each instrument stores different `readings`           |
| 21  | [Cart](21-cart-mongodb.png)                                       | `consumable_carts` — add / change qty / remove / clear                     |
| 29  | [Notifications](29-notifications.png)                             | `notifications` — mark read / unread, dismiss                              |
| 30  | [Announcements](30-announcements.png)                             | `announcements` — post, pin, edit, delete                                  |
| 31  | [Activity log](31-activity-log.png)                               | `activity_logs` — live audit trail with flexible metadata, annotate, purge |
| 32  | [Usage & insights](32-usage-insights.png)                         | SQL `GROUP BY` aggregates + MongoDB `$group` pipelines                     |

## Transaction proof

| #   | Screenshot                                                                   | Scenario                          | Result                                                                                                                                                                    |
| --- | ---------------------------------------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 14  | [Booking commit](14-booking-transaction-commit.png)                          | Book a free slot                  | `BEGIN → lock → overlap check → INSERT → COMMIT`                                                                                                                          |
| 15  | [Booking overlap](15-booking-overlap-rollback.png)                           | Book an overlapping slot          | `ROLLBACK`, no row inserted                                                                                                                                               |
| 20  | [DB state before](20-db-state-before-checkout.png)                           | Snapshot before checkout          | row / document counts + stock                                                                                                                                             |
| 22  | [Checkout commit](22-checkout-success-commit-trace.png)                      | Successful checkout               | MySQL `COMMIT` then MongoDB `commitTransaction()`; stock 120→116, 3→2                                                                                                     |
| 23  | [DB state after](23-db-state-after-checkout.png)                             | Snapshot after checkout           | `requests` +1, `request_items` +2, stock reduced, cart cleared                                                                                                            |
| 24  | [Insufficient stock](24-rollback-insufficient-stock.png)                     | Order more than in stock          | `ROLLBACK`; stock unchanged, cart kept                                                                                                                                    |
| 25  | [Simulated SQL failure](25-rollback-simulated-sql-failure.png)               | Error after stock was deducted    | `ROLLBACK` undoes the deduction                                                                                                                                           |
| 26  | [Mongo failure + compensation](26-rollback-mongo-abort-and-compensation.png) | Error after MySQL committed       | Mongo `abortTransaction()` + compensating SQL transaction restores stock and deletes the request                                                                          |
| 27  | [DB state after rollbacks](27-db-state-after-rollbacks.png)                  | Snapshot after all three failures | `requests`, `request_items`, `notifications` and stock match screenshot 23 — nothing partial was saved (only `activity_logs` grows, from the cart edits between attempts) |

## Diagrams

| #   | Diagram                                                                       |
| --- | ----------------------------------------------------------------------------- |
| 35  | [System architecture](35-diagram-system-architecture.png)                     |
| 36  | [SQL ER diagram](36-diagram-sql-er.png)                                       |
| 37  | [NoSQL document schema](37-diagram-nosql-schema.png)                          |
| 38  | [Checkout transaction sequence](38-diagram-checkout-transaction-sequence.png) |
