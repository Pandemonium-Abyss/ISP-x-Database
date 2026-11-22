# Screenshots

Screenshots of the running app, grouped by feature. Each row notes which table or collection the feature uses.

## 1. SQL Features (MySQL)

### 1.1 Authentication & User Management

| #   | Screenshot                                                                      | What it shows                              |
| --- | ------------------------------------------------------------------------------- | ------------------------------------------ |
| 01  | [![Login](01-login.png)](01-login.png)                                          | Sign-in page with demo accounts            |
| 02  | [![Register form](02-register-form.png)](02-register-form.png)                  | Create `users` (self-registration)         |
| 33  | [![Lab members](33-users-admin.png)](33-users-admin.png)                        | Read, change role, and delete `users`      |
| 34  | [![Profile avatar](34-profile-avatar-upload.png)](34-profile-avatar-upload.png) | Update profile; avatar saved to local disk |

### 1.2 Dashboard & Requests

| #   | Screenshot                                                                                    | What it shows                                                            |
| --- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| 03  | [![New member dashboard](03-dashboard-new-member.png)](03-dashboard-new-member.png)           | Dashboard for a new account (welcome notification is written to MongoDB) |
| 04  | [![Member dashboard](04-dashboard-member.png)](04-dashboard-member.png)                       | Open requests, equipment status, announcements, recent activity          |
| 05  | [![New request form](05-new-request-form.png)](05-new-request-form.png)                       | Create `requests` (type, priority, equipment FK)                         |
| 06  | [![Request detail](06-request-created-detail.png)](06-request-created-detail.png)             | Read `requests` joined with `users` and `equipment`                      |
| 08  | [![Staff queue](08-dashboard-staff-queue.png)](08-dashboard-staff-queue.png)                  | Unassigned and assigned-to-me queue, sorted by priority                  |
| 09  | [![Requests list](09-requests-list-joins.png)](09-requests-list-joins.png)                    | Filterable list built from a 4-table join                                |
| 10  | [![Picked up by staff](10-request-picked-up-by-staff.png)](10-request-picked-up-by-staff.png) | Update `requests.assignee_id` and `status`                               |

### 1.3 Equipment

| #   | Screenshot                                                                                          | What it shows                                                  |
| --- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| 11  | [![Edit equipment + image](11-equipment-edit-image-upload.png)](11-equipment-edit-image-upload.png) | Update `equipment`; photo stored in `server/uploads/equipment` |
| 12  | [![Equipment catalog](12-equipment-catalog.png)](12-equipment-catalog.png)                          | Read `equipment` with booking and request counts (subqueries)  |
| 13  | [![Equipment detail](13-equipment-detail-schedule.png)](13-equipment-detail-schedule.png)           | Schedule from `equipment_bookings` joined with `users`         |
| 16  | [![Bookings list](16-bookings-list.png)](16-bookings-list.png)                                      | Read, reschedule, cancel, and delete `equipment_bookings`      |

### 1.4 Consumables & Inventory

| #   | Screenshot                                                                                   | What it shows                                                                            |
| --- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| 18  | [![Consumables inventory](18-consumables-inventory.png)](18-consumables-inventory.png)       | Read `consumables` with low-stock flag and 30-day usage join                             |
| 19  | [![Edit stock](19-consumable-edit-stock-modal.png)](19-consumable-edit-stock-modal.png)      | Update stock                                                                             |
| 28  | [![Order with line items](28-order-request-items-join.png)](28-order-request-items-join.png) | Order history: `request_items` joined with `consumables`; edit quantity or remove a line |

---

## 2. NoSQL Features (MongoDB)

### 2.1 Communication & Collaboration

| #   | Screenshot                                                                                                   | Collection                                                        |
| --- | ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| 07  | [![Comment with attachment](07-request-comment-with-attachment.png)](07-request-comment-with-attachment.png) | `request_comments`: threaded comments, file attachment, reactions |
| 30  | [![Announcements](30-announcements.png)](30-announcements.png)                                               | `announcements`: post, pin, edit, delete                          |

### 2.2 Notifications & Activity Tracking

| #   | Screenshot                                                     | Collection                                                           |
| --- | -------------------------------------------------------------- | -------------------------------------------------------------------- |
| 29  | [![Notifications](29-notifications.png)](29-notifications.png) | `notifications`: mark read/unread, dismiss                           |
| 31  | [![Activity log](31-activity-log.png)](31-activity-log.png)    | `activity_logs`: audit trail with flexible metadata, annotate, purge |

### 2.3 Flexible Data & Analytics

| #   | Screenshot                                                                                                  | Collection                                                      |
| --- | ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| 17  | [![Maintenance logs](17-maintenance-logs-flexible-readings.png)](17-maintenance-logs-flexible-readings.png) | `maintenance_logs`: each instrument stores different `readings` |
| 21  | [![Cart](21-cart-mongodb.png)](21-cart-mongodb.png)                                                         | `consumable_carts`: add, change quantity, remove, clear         |
| 32  | [![Usage & insights](32-usage-insights.png)](32-usage-insights.png)                                         | SQL `GROUP BY` aggregates and MongoDB `$group` pipelines        |

---

## 3. Database Transaction & Rollback Proof

### 3.1 Equipment Booking

| #   | Screenshot                                                                                | Scenario                 | Result                                           |
| --- | ----------------------------------------------------------------------------------------- | ------------------------ | ------------------------------------------------ |
| 14  | [![Booking commit](14-booking-transaction-commit.png)](14-booking-transaction-commit.png) | Book a free slot         | `BEGIN`, lock, overlap check, `INSERT`, `COMMIT` |
| 15  | [![Booking overlap](15-booking-overlap-rollback.png)](15-booking-overlap-rollback.png)    | Book an overlapping slot | `ROLLBACK`, no row inserted                      |

### 3.2 Successful Checkout

| #   | Screenshot                                                                                       | Scenario                 | Result                                                                          |
| --- | ------------------------------------------------------------------------------------------------ | ------------------------ | ------------------------------------------------------------------------------- |
| 20  | [![DB state before](20-db-state-before-checkout.png)](20-db-state-before-checkout.png)           | Snapshot before checkout | Row and document counts, stock levels                                           |
| 22  | [![Checkout commit](22-checkout-success-commit-trace.png)](22-checkout-success-commit-trace.png) | Successful checkout      | MySQL `COMMIT`, then MongoDB `commitTransaction()`; stock 120 to 116 and 3 to 2 |
| 23  | [![DB state after](23-db-state-after-checkout.png)](23-db-state-after-checkout.png)              | Snapshot after checkout  | `requests` +1, `request_items` +2, stock reduced, cart cleared                  |

### 3.3 Checkout Failures & Rollbacks

| #   | Screenshot                                                                                                                    | Scenario                          | Result                                                                                                                                         |
| --- | ----------------------------------------------------------------------------------------------------------------------------- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| 24  | [![Insufficient stock](24-rollback-insufficient-stock.png)](24-rollback-insufficient-stock.png)                               | Order more than is in stock       | `ROLLBACK`; stock unchanged, cart kept                                                                                                         |
| 25  | [![Simulated SQL failure](25-rollback-simulated-sql-failure.png)](25-rollback-simulated-sql-failure.png)                      | Error after stock was deducted    | `ROLLBACK` undoes the deduction                                                                                                                |
| 26  | [![Mongo failure + compensation](26-rollback-mongo-abort-and-compensation.png)](26-rollback-mongo-abort-and-compensation.png) | Error after MySQL committed       | Mongo `abortTransaction()`, then a compensating SQL transaction restores stock and deletes the request                                         |
| 27  | [![DB state after rollbacks](27-db-state-after-rollbacks.png)](27-db-state-after-rollbacks.png)                               | Snapshot after all three failures | `requests`, `request_items`, `notifications`, and stock match screenshot 23. Only `activity_logs` grows, from the cart edits between attempts. |

---

## 4. System Architecture & Database Diagrams

### 4.1 System Architecture

Frontend, backend, database connections, and how they interact.

[![System Architecture](35-diagram-system-architecture.png)](35-diagram-system-architecture.png)

### 4.2 SQL Database Design

MySQL tables, attributes, primary and foreign keys, and relationships.

[![SQL ER Diagram](36-diagram-sql-er.png)](36-diagram-sql-er.png)

### 4.3 NoSQL Database Design

MongoDB collections, document structure, embedded data, and relationships between collections.

[![NoSQL Document Schema](37-diagram-nosql-schema.png)](37-diagram-nosql-schema.png)

### 4.4 Transaction Workflow

Checkout flow across frontend, backend, MySQL, and MongoDB, including commit, rollback, and compensation paths.

[![Checkout Transaction Sequence](38-diagram-checkout-transaction-sequence.png)](38-diagram-checkout-transaction-sequence.png)
