# Labrador — Laboratory Management System

Labrador is a web app for running a research lab: user accounts, equipment and bookings, consumable inventory, requests, announcements, and notifications. It replaces the usual mix of spreadsheets, email, and chat threads.

It uses two databases. MySQL holds the relational data (users, equipment, inventory, requests, bookings), and MongoDB holds the document-style data (comments, carts, logs, notifications, announcements).

---

## Project Deliverables

- **GitHub Repository:** [Pandemonium-Abyss/ISP-x-Database](https://github.com/Pandemonium-Abyss/ISP-x-Database) (complete source code and setup instructions in README)
- **System Architecture Diagram:** [`architecture.png`](docs/diagrams/architecture.png)
- **SQL ER Diagram:** [`er-diagram.png`](docs/diagrams/er-diagram.png)
- **NoSQL Document Schema Diagram:** [`nosql-schema.png`](docs/diagrams/nosql-schema.png)
- **Screenshots Documentation:** [`docs/screenshots/`](docs/screenshots/README.md) (UI features, CRUD actions, diagrams, and transaction/rollback proof)
- **Presentation Video:** [Watch Labrador Presentation](https://youtu.be/5izrg2WZO20)
- **Presentation Slides:** [`docs/Labrador-presentation.pdf`](docs/Labrador-presentation.pdf)

---

## 1. Project Overview

### Problem Statement

Research labs often track requests, shared equipment, and inventory across spreadsheets, emails, and chat apps. Things get lost, equipment gets double-booked, and nobody knows what is left in stock. Labrador puts these tasks in one web application.

### User Roles

| Role   | Permissions                                                                                             |
| ------ | ------------------------------------------------------------------------------------------------------- |
| Member | Submit requests, book equipment, order consumables, and comment on requests.                            |
| Staff  | Everything a member can do, plus manage requests, equipment, inventory, maintenance, and announcements. |
| Admin  | Access all features and manage users.                                                                   |

---

## 2. Technology Stack

| Component   | Technology                       |
| ----------- | -------------------------------- |
| Frontend    | React 18, Vite 6, Tailwind CSS 4 |
| Backend     | Node.js, Express 5               |
| Databases   | MySQL 8.4, MongoDB 7             |
| DB access   | mysql2, Mongoose                 |
| Auth        | JWT, bcryptjs                    |
| File upload | Multer                           |
| Deployment  | Docker Compose                   |

---

## 3. System Architecture

The React frontend talks to an Express REST API. The API reads and writes both databases and stores uploaded files on local disk.

![System Architecture](docs/diagrams/architecture.png)

---

## 4. Database Design

### 4.1 MySQL

Structured data that needs relationships and integrity. Six tables, with primary and foreign keys, unique and CHECK constraints, and indexes on frequently queried columns.

| Table                | Description                      |
| -------------------- | -------------------------------- |
| `users`              | User accounts and roles          |
| `equipment`          | Lab equipment                    |
| `consumables`        | Consumable inventory and stock   |
| `requests`           | Lab requests and orders          |
| `request_items`      | Line items for consumable orders |
| `equipment_bookings` | Equipment reservations           |

**ER Diagram:**

![MySQL ER Diagram](docs/diagrams/er-diagram.png)

### 4.2 MongoDB

Data that varies in shape or changes often. Six collections.

| Collection         | Description                                 |
| ------------------ | ------------------------------------------- |
| `activity_logs`    | Audit trail of app activity                 |
| `request_comments` | Request discussions, attachments, reactions |
| `notifications`    | Per-user notifications                      |
| `consumable_carts` | Temporary shopping carts                    |
| `maintenance_logs` | Equipment maintenance records               |
| `announcements`    | Lab announcements                           |

**NoSQL Schema Diagram:**

![MongoDB Schema Diagram](docs/diagrams/nosql-schema.png)

---

## 5. Core Functionality

- User registration, login, and role management.
- Equipment management and bookings.
- Consumable inventory with low-stock flags.
- Request submission and tracking.
- Shopping cart and consumables checkout.
- Request discussions with file attachments.
- Equipment maintenance records.
- Notifications and announcements.
- Activity log and usage statistics.

---

## 6. CRUD Operations

| Entity             | Create               | Read               | Update            | Delete              |
| ------------------ | -------------------- | ------------------ | ----------------- | ------------------- |
| Users              | Register / add user  | User directory     | Edit profile      | Delete user         |
| Equipment          | Add equipment        | Equipment list     | Edit equipment    | Delete equipment    |
| Consumables        | Add inventory        | Inventory list     | Update inventory  | Delete inventory    |
| Requests           | Submit request       | Request list       | Update request    | Delete request      |
| Request Items      | Create order items   | View order items   | Change quantity   | Remove order items  |
| Equipment Bookings | Create booking       | View bookings      | Reschedule        | Cancel booking      |
| Activity Logs      | Record activity      | View activity      | Annotate          | Delete entry        |
| Request Comments   | Post comment         | View comments      | Edit comment      | Delete comment      |
| Notifications      | Create notification  | View notifications | Mark as read      | Dismiss             |
| Consumable Carts   | Add cart items       | View cart          | Update quantity   | Remove items        |
| Maintenance Logs   | Create record        | View history       | Edit record       | Delete record       |
| Announcements      | Publish announcement | View announcements | Edit announcement | Delete announcement |

---

## 7. Transaction Management

Two operations touch several rows or both databases, so they run in transactions.

### 7.1 Consumables Checkout

This one spans MySQL and MongoDB.

1. Read the cart from MongoDB.
2. Start a MySQL transaction.
3. Lock the inventory rows and check stock.
4. Deduct stock.
5. Create the request and its order items.
6. Commit MySQL.
7. Start a MongoDB transaction.
8. Clear the cart and write activity logs and notifications.
9. Commit MongoDB.

If anything fails before step 6, MySQL rolls back. If MongoDB fails after the MySQL commit, the app runs compensating SQL to restore the stock and delete the new request and items.

### 7.2 Equipment Booking

MySQL only:

1. Start a transaction.
2. Lock the equipment row.
3. Check availability and maintenance status.
4. Check for overlapping bookings.
5. Insert the booking.
6. Commit.

If a check or the insert fails, the transaction rolls back.

**Transaction Sequence Diagram:**

![Checkout Sequence Diagram](docs/diagrams/checkout-sequence.png)

---

## 8. Project Setup

### Prerequisites

- Node.js 20 or later.
- Docker Desktop.
- Git.

### 8.1 Clone Repository

```bash
git clone https://github.com/Pandemonium-Abyss/ISP-x-Database.git
cd ISP-x-Database
```

### 8.2 Configure Environment

```bash
cp .env.example .env
```

Edit `.env` if you need different values.

### 8.3 Install Dependencies

```bash
npm run setup
```

### 8.4 Start Databases

```bash
npm run db:up
```

### 8.5 Initialize Database

```bash
npm run reset
```

This creates the tables and loads sample data.

**Warning:** This command drops and recreates the MySQL tables.

### 8.6 Start Application

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

### Demo Accounts

All demo accounts use the password `password123`.

| Role   | Email                    |
| ------ | ------------------------ |
| Admin  | `admin@labrador.local`   |
| Staff  | `somchai@labrador.local` |
| Staff  | `mali@labrador.local`    |
| Member | `ben@labrador.local`     |
| Member | `nicha@labrador.local`   |

---

## 9. API Documentation

All endpoints use the `/api` prefix and return JSON. Authentication uses a JWT sent as a cookie.

| Module         | Main Endpoints                                              |
| -------------- | ----------------------------------------------------------- |
| Authentication | `/auth/register`, `/auth/login`, `/auth/logout`, `/auth/me` |
| Users          | `/users`                                                    |
| Equipment      | `/equipment`                                                |
| Consumables    | `/consumables`                                              |
| Requests       | `/requests`                                                 |
| Comments       | `/requests/:id/comments`, `/comments/:id`                   |
| Bookings       | `/bookings`                                                 |
| Shopping Cart  | `/cart`, `/cart/items`, `/cart/checkout`                    |
| Notifications  | `/notifications`                                            |
| Maintenance    | `/maintenance`                                              |
| Announcements  | `/announcements`                                            |
| Activity Logs  | `/activity`                                                 |
| Dashboard      | `/dashboard`, `/stats`, `/db-state`                         |

---

## 10. Testing and Screenshots

### Testing

```bash
npm --prefix server test
```

The tests cover CRUD operations, file uploads, database constraints, booking validation, successful checkout, insufficient stock, and transaction rollback.

### Screenshots

Screenshots are in [`docs/screenshots/`](docs/screenshots/README.md). They show:

- Authentication and user management.
- Dashboard, requests, and discussions.
- Equipment, bookings, and maintenance.
- Consumable inventory, cart, and checkout.
- Notifications, announcements, activity logs, and usage statistics.
- Transaction commits and rollbacks.
- System architecture, ER, NoSQL schema, and sequence diagrams.

---

## 11. Project Documentation

| Resource                    | Location                                                       |
| --------------------------- | -------------------------------------------------------------- |
| System Architecture Diagram | [`architecture.png`](docs/diagrams/architecture.png)           |
| MySQL ER Diagram            | [`er-diagram.png`](docs/diagrams/er-diagram.png)               |
| MongoDB Schema Diagram      | [`nosql-schema.png`](docs/diagrams/nosql-schema.png)           |
| Checkout Sequence Diagram   | [`checkout-sequence.png`](docs/diagrams/checkout-sequence.png) |
| Mermaid Source Files        | [`diagrams/src/`](docs/diagrams/src/)                          |
| Application Screenshots     | [`screenshots/`](docs/screenshots/README.md)                   |
| Presentation Slides         | [`Labrador-presentation.pdf`](docs/Labrador-presentation.pdf)  |
