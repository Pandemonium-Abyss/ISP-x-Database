<p align="center">
  <img src="docs/images/logo.png" alt="Labrador logo" width="160" />
</p>

<h1 align="center">Labrador</h1>

<p align="center">
  Lab workflow &amp; request management — Next.js frontend, FastAPI backend, PostgreSQL and MongoDB.
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

## Live demo

**<https://labradorxdatabase.isimpsofar.jp.net>**

Sign in with the shared guest account:

| Email | Password |
| --- | --- |
| `example.user@gmail.com` | `12345678` |

The guest is a regular lab member: you can file tickets, discuss them with the
lab admins, follow your tasks and announcements, and browse the equipment.
Admin pages (users, categories, the activity log) are not available to it.
Please don't change the guest's password or email — everyone shares it.

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

| Compose service | Role                               | Port on your machine | Port inside Docker |
| --------------- | ---------------------------------- | -------------------- | ------------------ |
| `nextjs`        | Next.js frontend                   | 3100                 | 3000               |
| `fastapi`       | FastAPI backend                    | 8100                 | 8000               |
| `postgres`      | PostgreSQL 17, in a volume         | 5433 (dev only)      | 5432               |
| `mongo`         | MongoDB 8, in a volume             | 27018 (dev only)     | 27017              |
| `tunnel`        | Cloudflare Tunnel (prod, optional) | —                    | —                  |

Two numbers per service, because Docker maps one onto the other: `3100:3000`
means "port 3100 on the machine forwards to port 3000 inside the container".

- **Port on your machine** is what *you* use: the browser, `curl`, psql. The
  app is on 3100/8100 rather than 3000/8000 so it can sit next to other things
  (or another copy of itself) that already hold those.
- **Port inside Docker** is what *containers* use to reach each other, by
  service name: the backend connects to `postgres:5432`, the tunnel forwards to
  `nextjs:3000`. Inside a container, `localhost` means that container itself.

API docs are served at `http://localhost:8100/docs`.

Data lives in two databases: **PostgreSQL** for the relational core (accounts,
categories, tasks, tickets, announcements) and **MongoDB** for data whose shape
varies or that piles up: `equipment`, `notifications` (expire after 30 days),
`audit_logs` (the change history) and `ticket_threads` (the discussion on each
ticket).

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

### Sample data

To have something to click through, fill the database with 8 sample tickets
(some accepted into tasks, one rejected, several with discussion threads):

```bash
docker compose -f docker-compose.dev.yaml --env-file source/.env exec fastapi \
  uv run python -m app.seed_tickets
```

It needs at least one active **Lab User** to file them and a **Lab Owner** or
**Lab Admin** to judge them, so create the owner first and a member from
*Settings → Users*. It goes through the same code as the app, so quotas,
notifications, the audit log and tasks all behave as if people did it. Running
it again skips tickets that are already there.

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

`docker-compose.prod.yaml` builds a Next.js standalone server, runs the backend with `fastapi run` on several workers as a non-root user, and runs PostgreSQL 17 and MongoDB 8 with their data in the `postgres-data` and `mongo-data` volumes. All of them have health checks and restart automatically. Neither database port is published; only the backend reaches them, over the compose network.

### A shortcut first

Every compose command for production needs the same two arguments, and
forgetting `--env-file source/.env` fails with *"required variable … is missing
a value"*. Define a shortcut once on the server:

```bash
echo "alias dc='docker compose -f docker-compose.prod.yaml --env-file source/.env'" >> ~/.bashrc
source ~/.bashrc
```

If Docker needs `sudo` on your server, put it in the alias
(`alias dc='sudo docker compose …'`), or let your user run Docker without it:
`sudo usermod -aG docker $USER`, then log out and back in. The commands below
use `dc`.

### Production `.env`

Make it **on the server** — never copy your development one, it has the
sample passwords. This writes matching, freshly generated database passwords
into all four places they appear, and keeps a backup:

```bash
git clone https://github.com/PathadonAougsk/ISP.git
cd ISP
cp source/.env.sample source/.env
chmod 600 source/.env
cp source/.env source/.env.bak

set_env() {  # KEY VALUE: replace the line, or add it
  if grep -q "^$1=" source/.env; then sed -i "s|^$1=.*|$1=$2|" source/.env
  else echo "$1=$2" >> source/.env; fi
}
PG=$(openssl rand -hex 16); MG=$(openssl rand -hex 16)
set_env POSTGRES_PASSWORD          "$PG"
set_env DATABASE_URL               "postgresql+asyncpg://postgres:$PG@postgres:5432/isp"
set_env MONGO_INITDB_ROOT_PASSWORD "$MG"
set_env MONGO_URL                  "mongodb://mongo:$MG@mongo:27017/?authSource=admin"
set_env JWT_SECRET                 "$(openssl rand -hex 32)"
unset PG MG
```

Then set the two addresses browsers use (your domain, or `http://<server-ip>:8100`
and `:3100` without a tunnel):

```bash
set_env NEXT_PUBLIC_API_URL https://api.<your-domain>
set_env CORS_ORIGINS        https://app.<your-domain>
```

Things to know before the first start:

- **Database passwords are fixed on the first start.** `POSTGRES_*` and
  `MONGO_INITDB_*` are only read when the volumes are created. Changing them
  later does not change the real password; the backend then fails with
  *password authentication failed*. On a server with no data yet,
  `dc down -v && dc up -d --build` starts over. Once there is real data, never
  use `-v`.
- **The password inside each URL must equal its `*_PASSWORD`.** Stick to
  letters and digits (the `openssl rand -hex` output is fine) — `@`, `:` or `/`
  break the URLs.
- **Keep the database hosts as `@postgres:5432` and `@mongo:27017`**, not
  `localhost`: those are the containers' names on the compose network.
- **Back the file up** somewhere safe (a password manager). Lose `JWT_SECRET`
  and everyone is signed out; lose the database passwords and you are locked
  out of the data.

### Start it

```bash
dc up -d --build
dc ps                          # everything "healthy"
curl -f http://localhost:8100/health
dc exec fastapi python -m app.create_owner --username owner --email owner@example.com
```

`--build` matters: `NEXT_PUBLIC_*` values are baked into the frontend at
**build** time, so rebuild after changing any of them. The production image
has no `uv`, so scripts run with plain `python -m`. That includes the sample
data, if you want it: `dc exec fastapi python -m app.seed_tickets` (see
*Sample data* above for what it needs).

### Exposing it with Cloudflare Tunnel (optional)

The `tunnel` service publishes the app on your domain over HTTPS without
opening any inbound ports, which works even behind NAT/CGNAT. It needs a domain
whose DNS is on Cloudflare.

1. **Zero Trust → Networks → Tunnels → Create a tunnel → Cloudflared.** Name
   it, copy the **token** from the install command it shows, and do **not** run
   that command — compose runs `cloudflared` for you.
2. **Add two public hostnames** to that tunnel:

   | Subdomain | Service type | URL |
   | --- | --- | --- |
   | `app` (e.g. `labradorxdatabase`) | HTTP | `nextjs:3000` |
   | `api` (e.g. `labradorxdatabase-api`) | HTTP | `fastapi:8000` |

   - Use the **ports inside Docker, 3000 and 8000** — not 3100/8100, and not
     `localhost`. The tunnel runs in its own container on the compose network
     and reaches the others by name; `localhost` there is the tunnel itself,
     and you get a *502 Bad Gateway*.
   - Pick **HTTP**: Cloudflare does the HTTPS for visitors; inside Docker it is
     plain HTTP. (If the form has one "Service" box, type `http://nextjs:3000`.)
   - Keep both names **one level** under your domain (`labradorxdatabase-api.example.com`,
     not `api.labradorxdatabase.example.com`). Cloudflare's free certificate
     only covers one level; deeper names get certificate errors.

3. **In `source/.env`** (`set_env` is the helper from *Production `.env*` —
   paste its definition again in a new terminal, or just edit the file with
   `nano source/.env`):

   ```bash
   set_env TUNNEL_TOKEN        <token>
   set_env COMPOSE_PROFILES    tunnel     # starts the tunnel with every `dc up`
   set_env NEXT_PUBLIC_API_URL https://<api-hostname>
   set_env CORS_ORIGINS        https://<app-hostname>
   ```

   To keep the token out of your shell history:
   `read -rsp "Token: " T && echo && set_env TUNNEL_TOKEN "$T" && unset T`.

4. **Rebuild and check:**

   ```bash
   dc up -d --build
   dc logs tunnel --tail 20      # look for "Registered tunnel connection"
   ```

Once the tunnel works, nobody needs 3100/8100 from outside; close them in the
server's firewall if you like.

### Two copies on one server

Each clone is its own compose project (named after its folder), with its own
containers, network and volumes, so an older copy can keep running next to a
new one. Two rules:

- **Different host ports.** Only one thing can hold a port on the machine; if
  the other copy has 3000/8000, this one uses 3100/8100 (*port is already
  allocated* means they clash).
- **Different tunnels.** Give each copy its own tunnel and token. Two copies
  sharing one token become two connectors of the *same* tunnel, and Cloudflare
  sends each visitor to either copy at random.

### Updating production

```bash
git pull
dc up -d --build
```

Data stays: it is in the volumes, which `up --build` never touches. Tables,
collections, indexes and one-off migrations are applied by the backend on
startup.

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

**`password authentication failed for user "postgres"`** (backend unhealthy,
frontend and tunnel never start) — the password in `DATABASE_URL` is not the
one the database was created with. Check the two match in `source/.env`; if the
database was first started with different values, see *Database passwords are
fixed on the first start*. MongoDB's version of this is `Authentication failed`.

**`dependency failed to start: container … fastapi … is unhealthy`** — the
backend could not start; the reason is in `dc logs fastapi --tail 40`.

**`port is already allocated`** — something on the machine already holds that
host port, often another copy of this app (`docker ps` shows it). Change the
left number of the mapping, or stop the other thing.

**Tunnel site doesn't load** — *502 Bad Gateway*: the hostname's service is
wrong; it must be `http://nextjs:3000` / `http://fastapi:8000`. *Site can't be
reached / no such host*: the public hostname was never saved to the tunnel, or
a DNS record with that name already existed — check Cloudflare's DNS records
for a CNAME to `….cfargotunnel.com`. *Certificate error*: the hostname is two
levels deep.

**Frontend can't reach the backend**: check whether the call runs in the browser or on the server, and use the matching hostname above. In prod, `CORS_ORIGINS` must be the frontend's address exactly (`https://`, no trailing slash), and `NEXT_PUBLIC_API_URL` the API's — then rebuild.

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
