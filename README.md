# ISP — Labrador

Full-stack project with a Next.js frontend and a FastAPI backend, both run through Docker Compose in development mode with hot reload.

**Course:** Individual Software Development Process' 2026 \
**Team:** Wassawin the Goat of All Time (W-GOAT) \
**Chosen IRL Challenge:** Project B Lab Workflow & Request Management

## Team members

| Name                     | Student ID | GitHub                                              |
| ------------------------ | ---------- | --------------------------------------------------- |
| Kantinan Lertluckpreecha | 6810545476 | [LELOUCH2L](https://github.com/LELOUCH2L)           |
| Jedsada Ungsunantwiwat   | 6810545522 | [Jadeung123](https://github.com/Jadeung123)         |
| Pathadon Aougsk          | 6810545808 | [PathadonAougsk](https://github.com/PathadonAougsk) |
| Wassawin Swangjaeng      | 6810545905 | [CYRTRUS](https://github.com/CYRTRUS)               |
| Siraphob Phonphakdee     | 6810545930 | [vaporform](https://github.com/vaporform)           |

## Project status

Currently in Phase iteration 2 (Such as wireframe, various endpoints and etc.)
Overall a working demo.

## Documents & diagrams

All specs, reports, and diagrams live in [`docs/`](docs):

| File / folder                                                  | Contents                           |
| -------------------------------------------------------------- | ---------------------------------- |
| `docs/ISP-SKE-26 3 Wassawin the Goat of All Time (W-GOAT).pdf` | Software Requirement Specification |
| `docs/ISP-SKE26 Iteration Report 1 W-GOAT.pdf`                 | Iteration Report 1                 |
| `docs/use_case_diagram/`                                       | Use case diagram                   |
| `docs/sequence_diagram/`                                       | Sequence diagrams (SQD-1 … SQD-7)  |
| `docs/activity_diagram/`                                       | Activity diagrams (AD-1 … AD-6)    |
| `docs/gantt_chart/`                                            | Project Gantt chart                |

## Stack

| Service        | Description                 | URL                     |
| -------------- | --------------------------- | ----------------------- |
| `nextjs`       | Frontend, `npm run dev`     | <http://localhost:3000> |
| `fastapi`      | FastAPI API, `fastapi dev`  | <http://localhost:8000> |
| `postgres`     | PostgreSQL 17, in a volume  | `localhost:5433`        |

API docs are served by FastAPI at <http://localhost:8000/docs>

The database is part of the stack rather than a hosted service, so there is
nothing to sign up for and no keys to hand around. The backend owns both
halves of a login: passwords are bcrypt hashes in `auth.users`, and signing in
at `POST /auth/login` returns a JWT the frontend sends as a bearer token.

## Prerequisites

- [Docker Engine](https://docs.docker.com/engine/install/) 20.10+
- Docker Compose v2 (bundled with Docker Desktop; on Linux install the `docker-compose-plugin`)

```bash
docker --version
docker compose version
```

You do **not** need Node.js or Python installed locally — both run inside containers.

## Setup

```bash
git clone https://github.com/PathadonAougsk/ISP.git
cd ISP
```

### Create `.env`

This step is required. There is **one** env file for the whole repo, `source/.env`, and both services read it. It is gitignored, so a fresh clone won't have it and compose will refuse to start without it.

```bash
cp source/.env.sample source/.env
```

Then fill in the real values. `source/.env.sample` lists every key that is used:

| Key                         | Used by           | Notes                                                           |
| --------------------------- | ----------------- | --------------------------------------------------------------- |
| `POSTGRES_USER`             | postgres          | Role the database is created with                               |
| `POSTGRES_PASSWORD`         | postgres          | Its password — fine to leave as the sample locally              |
| `POSTGRES_DB`               | postgres          | Database name                                                   |
| `DATABASE_URL`              | backend           | `postgresql+asyncpg://…`; host `postgres` in compose             |
| `JWT_SECRET`                | backend           | Signs the access tokens. 32+ chars: `openssl rand -hex 32`      |
| `ACCESS_TOKEN_TTL_MINUTES`  | backend, optional | How long a login lasts. Default 720                             |
| `NEXT_PUBLIC_API_URL`       | frontend          | `http://localhost:8000` locally                                 |

The three `POSTGRES_*` values only take effect the first time the container
starts, because that is when it creates the database. Changing them later
means `docker compose down -v` and starting over.

`JWT_SECRET` is the only thing standing behind every login, so generate a real
one and keep it out of the frontend. Anything prefixed `NEXT_PUBLIC_` is
inlined into the browser bundle, which is why no key there is a secret.

How each side picks the file up:

- **Backend** — `load_dotenv()` walks up from `source/backend/app/` and finds `source/.env`.
- **Docker / CI** — compose passes `env_file: "./source/.env"` to both services; real environment variables always win over the file.

## Running

```bash
docker compose up -d
```

`-d` runs detached, so the containers stay up after you close the terminal. The first run builds both images and will take a few minutes.

Once it's up:

- Frontend: <http://localhost:3000>
- Backend: <http://localhost:8000>
- Swagger UI: <http://localhost:8000/docs>

The backend creates any missing tables when it starts, so a brand new volume
needs no migration step.

### Create the first login

A fresh database has no accounts in it, and every other way of creating one
needs an admin to be signed in already. Make the Lab Owner once:

```bash
docker compose exec fastapi \
  uv run python -m app.create_owner --username owner --email owner@example.com
```

It asks for a password (or reads `OWNER_PASSWORD`), and that email and
password are what you sign in with at <http://localhost:3000/auth>. Everyone
else is created from the app, by an admin.

Run it again with the same email to reset that password and put the account
back to an active Lab Owner — the way back in if nobody can sign in.

### When to rebuild

Both services bind-mount your source code into the container, so editing files on your machine hot-reloads inside the container. No rebuild needed for normal code changes.

Rebuild when you change a `Dockerfile`, `package.json`, or the Python dependencies:

```bash
docker compose up -d --build
```

## Common commands

```bash
# Status of both services
docker compose ps

# Follow logs from everything
docker compose logs -f

# Follow logs from one service
docker compose logs -f fastapi
docker compose logs -f nextjs

# Shell into a container
docker compose exec fastapi bash
docker compose exec nextjs sh

# A psql prompt on the database
docker compose exec postgres psql -U postgres -d isp

# Backend tests. They run against the live database and clean up after
# themselves; from your machine, point DATABASE_URL at localhost:5433 rather
# than the compose hostname.
docker compose exec fastapi uv run pytest

# Install a new npm package (inside the container, so it lands in the right node_modules)
docker compose exec nextjs npm install <package>

# Restart one service
docker compose restart fastapi

# Stop
docker compose stop

# Stop and remove containers + network
docker compose down

# Nuke volumes too (clears the node_modules cache)
docker compose down -v
```

## How the services talk to each other

- **From your browser** (client-side fetches in the frontend): use `http://localhost:8000`.
- **From inside the frontend container** (SSR, API routes, server components): use `http://fastapi:8000`. Compose puts both containers on the same network and resolves service names as hostnames. `localhost` inside a container means that container, not your machine.

## Troubleshooting

**`env file ./source/.env not found`** — you skipped the setup step above. Create the file.

**Port 3000 or 8000 already in use** — something else is bound to that port. Stop it, or change the host side of the mapping in `docker-compose.dev.yaml` (the left number in `"3000:3000"`).

**`failed to bind host port 0.0.0.0:5432: address already in use`** — a
PostgreSQL on your own machine is holding 5432. The container is published on
5433 for exactly this reason, so if you see this, something took 5433 as well:
change the left number in the `postgres` port mapping. Nothing inside compose
cares, because the backend reaches the database as `postgres:5432` on the
compose network. On Linux the usual culprit is the system service —
`systemctl status postgresql` tells you, and `sudo systemctl disable --now
postgresql` frees 5432 for good if you would rather have it.

**Frontend can't reach the backend** — check whether the call runs in the browser or on the server, and use the matching hostname from the section above.

**`Cannot find module` in the frontend after adding a dependency** — the `/app/node_modules` anonymous volume is masking your host folder. Run the install inside the container, or rebuild with `docker compose up -d --build`.

**Backend not reloading on save** — confirm the file you edited is under `./backend`, which is mounted to `/Backend` in the container. Files outside that path aren't synced.

**`JWT_SECRET is only N characters`** — the backend refuses to start with a
signing key short enough to guess. Put a real one in `source/.env`:
`openssl rand -hex 32`.

**Nothing can sign in on a new clone** — the database is empty until you create
the Lab Owner; see *Create the first login*.

**Everyone is signed out after a restart** — tokens are signed with
`JWT_SECRET`, so changing it invalidates every token already handed out.

**Something is deeply stuck** — `docker compose down -v && docker compose up -d --build` gives a clean slate. Note that `-v` also drops the database volume, so the accounts go with it and the Lab Owner has to be created again.

## Notes

- Compose v2 is `docker compose` (space). The hyphenated `docker-compose` v1 is end-of-life.
- This compose file is development-only: `npm run dev` and `fastapi dev` are not suitable for production. A production setup would need a separate compose file with built assets and a proper ASGI server config.
- `source/.env.sample` is committed (an exception to the `.env*` gitignore rule) and lists every required key with dummy values. Keep it in sync when you add a key.
