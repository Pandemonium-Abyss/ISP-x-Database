<p align="center">
  <img src="docs/images/logo.png" alt="Labrador logo" width="160" />
</p>

<h1 align="center">Labrador</h1>

<p align="center">
  Lab workflow &amp; request management — Next.js frontend, FastAPI backend, PostgreSQL.
</p>

<p align="center">
  <img src="docs/images/lab.jpg" alt="Labrador dashboard in production" width="720" />
  <br />
  <em>The live Labrador dashboard.</em>
</p>

---

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

## Documents & diagrams

Everything lives in [`docs/`](docs).

### Iteration reports

| Iteration | Report                                                                                          |
| --------- | ----------------------------------------------------------------------------------------------- |
| 1         | [ISP-SKE26 Iteration Report 1 W-GOAT.pdf](docs/ISP-SKE26%20Iteration%20Report%201%20W-GOAT.pdf) |
| 2         | [ISP-SKE26 Iteration Report 2 W-GOAT.pdf](docs/ISP-SKE26%20Iteration%20Report%202%20W-GOAT.pdf) |
| 3         | [ISP-SKE26 Iteration Report 3 W-GOAT.pdf](docs/ISP-SKE26%20Iteration%20Report%203%20W-GOAT.pdf) |
| 4         | [ISP-SKE26 Iteration Report 4 W-GOAT.pdf](docs/ISP-SKE26%20Iteration%20Report%204%20W-GOAT.pdf) |
| 5         | [ISP-SKE26 Iteration Report 5 W-GOAT.pdf](docs/ISP-SKE26%20Iteration%20Report%205%20W-GOAT.pdf) |

### Specs & diagrams

| File / folder                                                  | Contents                           |
| -------------------------------------------------------------- | ---------------------------------- |
| `docs/ISP-SKE-26 3 Wassawin the Goat of All Time (W-GOAT).pdf` | Software Requirement Specification |
| `docs/use_case_diagram/`                                       | Use case diagram                   |
| `docs/sequence_diagram/`                                       | Sequence diagrams (SQD-1 … SQD-7)  |
| `docs/activity_diagram/`                                       | Activity diagrams (AD-1 … AD-6)    |
| `docs/gantt_chart/`                                            | Project Gantt chart                |

## Stack

| Compose service | Role                                 | Port |
| --------------- | ------------------------------------ | ---- |
| `nextjs`        | Next.js frontend                     | 3100 |
| `fastapi`       | FastAPI backend                      | 8100 |
| `postgres`      | PostgreSQL 17, in a volume (dev)     | 5433 |
| `mongo`         | MongoDB 8, in a volume (dev)         | 27018 |
| `tunnel`        | Cloudflare Tunnel (prod, optional)   | —    |

API docs are served at `http://localhost:8100/docs`.

| Compose file               | Purpose                                                      |
| -------------------------- | ------------------------------------------------------------ |
| `docker-compose.dev.yaml`  | Local development — source bind-mounted, hot reload          |
| `docker-compose.prod.yaml` | Production — built images, multi-worker server, auto-restart |

The database is part of the stack rather than a hosted service, so there is
nothing to sign up for and no keys to hand around. The backend owns both
halves of a login: passwords are bcrypt hashes in `auth.users`, and signing in
at `POST /auth/login` returns a JWT the frontend sends as a bearer token.

## Prerequisites

- [Docker Engine](https://docs.docker.com/engine/install/) 20.10+ with Docker Compose v2 (`docker compose`, with a space)

Node.js and Python are **not** needed on your machine — both run in containers.

```bash
docker --version
docker compose version
```

## 1. Clone and configure

```bash
git clone https://github.com/PathadonAougsk/ISP.git
cd ISP
cp source/.env.sample source/.env
```

Fill in `source/.env`. It is the **only** env file; both services and both compose files read it. It's gitignored, so a fresh clone won't have one.

| Key                         | Used by           | Notes                                                           |
| --------------------------- | ----------------- | --------------------------------------------------------------- |
| `POSTGRES_USER`             | postgres          | Role the database is created with                               |
| `POSTGRES_PASSWORD`         | postgres          | Its password — fine to leave as the sample locally              |
| `POSTGRES_DB`               | postgres          | Database name                                                   |
| `DATABASE_URL`              | backend           | `postgresql+asyncpg://…`; host `postgres` in compose             |
| `MONGO_INITDB_ROOT_USERNAME` / `_PASSWORD` | mongo | Root user, created on the container's first run only |
| `MONGO_URL`                 | backend           | `mongodb://user:pass@mongo:27017/?authSource=admin` in compose  |
| `MONGO_DB`                  | backend, optional | Database name. Default `isp`                                    |
| `JWT_SECRET`                | backend           | Signs the access tokens. 32+ chars: `openssl rand -hex 32`      |
| `ACCESS_TOKEN_TTL_MINUTES`  | backend, optional | How long a login lasts. Default 720                             |
| `NEXT_PUBLIC_API_URL`       | frontend          | `http://localhost:8100` locally; your public API URL in prod    |
| `CORS_ORIGINS`              | backend (prod)    | Comma-separated allowed origins, default `http://localhost:3100` |
| `WEB_CONCURRENCY`           | backend (prod)    | Server workers, default `2`                                     |
| `TUNNEL_TOKEN`              | tunnel (prod)     | Cloudflare Tunnel token, only with `--profile tunnel`           |

The three `POSTGRES_*` values only take effect the first time the container
starts, because that is when it creates the database. Changing them later
means `docker compose down -v` and starting over.

`JWT_SECRET` is the only thing standing behind every login, so generate a real
one and keep it out of the frontend. Anything prefixed `NEXT_PUBLIC_` is
inlined into the browser bundle, which is why no key there is a secret.

How each side picks the file up:

- **Backend** — `load_dotenv()` walks up from `source/backend/app/` and finds `source/.env`.
- **Docker / CI** — compose passes `env_file: "./source/.env"` to both services; real environment variables always win over the file.

## 2. Run locally (development)

```bash
docker compose -f docker-compose.dev.yaml --env-file source/.env up -d
```

The first run builds both images and takes a few minutes. Then open:

- Frontend: <http://localhost:3100>
- Backend: <http://localhost:8100> (health check at `/health`)
- Swagger UI: <http://localhost:8100/docs>

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
password are what you sign in with at <http://localhost:3100/auth>. Everyone
else is created from the app, by an admin.

Run it again with the same email to reset that password and put the account
back to an active Lab Owner — the way back in if nobody can sign in.

### When to rebuild

Source folders are bind-mounted, so saving a file hot-reloads inside the container. Rebuild only after changing a `Dockerfile*`, `package.json`, or Python dependencies:

```bash
docker compose -f docker-compose.dev.yaml --env-file source/.env up -d --build
```

Handy commands (run `export COMPOSE_FILE=docker-compose.dev.yaml` once so you can drop the `-f`):

```bash
docker compose ps                         # status
docker compose logs -f                    # all logs
docker compose logs -f fastapi            # one service
docker compose exec fastapi bash          # shell into the backend
docker compose exec nextjs sh             # shell into the frontend
docker compose exec nextjs npm install <package>
docker compose exec fastapi uv run pytest # backend tests (live DB, cleans up)
docker compose exec postgres psql -U postgres -d isp   # psql prompt
docker compose exec mongo mongosh -u mongo -p mongo isp --authenticationDatabase admin   # mongosh
docker compose down                       # stop and remove
docker compose down -v                    # also clear volumes, database included
```

## 3. Run in production

`docker-compose.prod.yaml` builds a Next.js standalone server, runs the backend with `fastapi run` on several workers as a non-root user, and runs PostgreSQL 17 and MongoDB 8 with their data in the `postgres-data` and `mongo-data` volumes. All four have health checks and restart automatically. Neither database port is published; only the backend reaches them, over the compose network.

For production, set real `POSTGRES_PASSWORD` and `MONGO_INITDB_ROOT_PASSWORD` values (and the matching passwords in `DATABASE_URL` and `MONGO_URL`) and a freshly generated `JWT_SECRET` before the first start.

```bash
# on the server
git clone https://github.com/PathadonAougsk/ISP.git
cd ISP
cp source/.env.sample source/.env   # then fill in production values

docker compose -f docker-compose.prod.yaml --env-file source/.env up -d --build
```

`--env-file source/.env` is required: the `NEXT_PUBLIC_*` values are baked into the frontend at **build** time, so compose must read them before building. After changing any `NEXT_PUBLIC_*` value, rebuild with `--build`.

Create the Lab Owner once, the same as in development. The production image has no `uv`, so call Python directly:

```bash
docker compose -f docker-compose.prod.yaml exec fastapi \
  python -m app.create_owner --username owner --email owner@example.com
```

Check that it's healthy:

```bash
docker compose -f docker-compose.prod.yaml ps
curl -f http://localhost:8100/health
```

### Exposing it with Cloudflare Tunnel (optional)

The `tunnel` service publishes the app without opening inbound ports, which works even behind NAT/CGNAT.

1. Create a Named Tunnel in Cloudflare Zero Trust → Networks → Tunnels, and put its token in `source/.env` as `TUNNEL_TOKEN`.
2. Add public hostnames to the tunnel that point at the compose service names:
   - `app.<your-domain>` → `http://nextjs:3000`
   - `api.<your-domain>` → `http://fastapi:8000`
3. In `source/.env`, set `NEXT_PUBLIC_API_URL=https://api.<your-domain>` and `CORS_ORIGINS=https://app.<your-domain>`.
4. Start everything with the tunnel profile:

```bash
docker compose -f docker-compose.prod.yaml --env-file source/.env --profile tunnel up -d --build
```

### Updating production

```bash
git pull
docker compose -f docker-compose.prod.yaml --env-file source/.env --profile tunnel up -d --build
```

## How the services talk to each other

- **From the browser** (client-side fetches): use `NEXT_PUBLIC_API_URL` — `http://localhost:8100` locally.
- **From inside a container** (SSR, server components): use `http://fastapi:8000`. Compose resolves service names as hostnames; `localhost` inside a container means that container.

## Troubleshooting

**`env file ./source/.env not found`** or **`set in source/.env`**: you skipped step 1, or left out `--env-file source/.env`.

**Port 3100 or 8100 already in use** — something else is bound to that port. Stop it, or change the host side of the mapping in `docker-compose.dev.yaml` (the left number in `"3100:3000"`).

**`failed to bind host port 0.0.0.0:5432: address already in use`** — a
PostgreSQL on your own machine is holding 5432. The container is published on
5433 for exactly this reason, so if you see this, something took 5433 as well:
change the left number in the `postgres` port mapping. Nothing inside compose
cares, because the backend reaches the database as `postgres:5432` on the
compose network. On Linux the usual culprit is the system service —
`systemctl status postgresql` tells you, and `sudo systemctl disable --now
postgresql` frees 5432 for good if you would rather have it.

**Frontend can't reach the backend**: check whether the call runs in the browser or on the server, and use the matching hostname above. In prod, also check `CORS_ORIGINS`.

**Changed a `NEXT_PUBLIC_*` value but prod didn't pick it up**: those are build-time values; rerun with `--build`.

**`Cannot find module` after adding a frontend dependency (dev)**: install it inside the container, or rebuild with `--build`.

**`JWT_SECRET is only N characters`** — the backend refuses to start with a
signing key short enough to guess. Put a real one in `source/.env`:
`openssl rand -hex 32`.

**Nothing can sign in on a new clone** — the database is empty until you create
the Lab Owner; see *Create the first login*.

**Everyone is signed out after a restart** — tokens are signed with
`JWT_SECRET`, so changing it invalidates every token already handed out.

**Something is deeply stuck** — `docker compose -f docker-compose.dev.yaml down -v`, then bring it back up with `--build`. Note that `-v` also drops the database volume, so the accounts go with it and the Lab Owner has to be created again.

## Notes

- `source/.env.sample` is committed (an exception to the `.env*` gitignore rule). Keep it in sync when you add a key.
- CI builds both Docker images on every pull request to `main` (`.github/workflows/Docker-build-check.yml`).
