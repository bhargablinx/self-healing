# Self-Healing Software

The V1 goal is to detect failures in explicitly monitored Docker containers, store incidents in PostgreSQL, and display them in a dashboard. V1 does not use AI or perform automatic recovery. See [context.md](context.md) for scope and safety requirements and the verified implementation status.

## Backend foundation

The Express + TypeScript backend is in `backend/`. It uses Prisma 7 with PostgreSQL. `backend/prisma/schema.prisma` is the schema source of truth; application code uses one shared Prisma Client instance and the PostgreSQL driver adapter.

### Run locally

Requires Node.js 20.19+ (Node.js 22 LTS recommended) and a reachable PostgreSQL instance.

```bash
cd backend
cp .env.example .env
npm install
npm run prisma:generate
npm run prisma:migrate -- --name init
npm run dev
```

When running directly with `npm run dev`, the API health endpoint is `GET http://localhost:3000/api/health`. Configure the server port and database URL in `backend/.env`. To monitor locally, also set `MONITORED_CONTAINERS` to a comma-separated allowlist and make sure the process can access the Docker socket. Create a migration during development with `npm run prisma:migrate -- --name add_schema_change`.

## Run the demo and database with Docker Compose

Docker Compose runs PostgreSQL, the backend, the demo service, and the React dashboard.

```bash
cp .env.example .env
docker compose up --build -d
docker compose ps
```

Open the dashboard at `http://localhost:5173/`, the demo at `http://localhost:4000/`, and the Compose backend at `http://localhost:3001/api/health` by default. The dashboard reads the API and refreshes every five seconds. Set `FRONTEND_PORT` or `BACKEND_PORT` in `.env` to change the host ports; if the backend port changes, the frontend image build receives that port as its API URL. Stop the stack with `docker compose down`. The named `postgres_data` volume keeps the database when containers are recreated; `docker compose down -v` also deletes that data.

The backend monitors only names listed in `MONITORED_CONTAINERS` (the example defaults to `self-healing-demo-app`). To see monitor output, run `docker compose logs -f backend`. You can demonstrate detection with `docker compose stop demo-app`, then restore the demo with `docker compose start demo-app`. Repeated detection logs are suppressed in memory, and the database deduplication key also prevents duplicate active incidents across backend restarts.

The monitor updates service telemetry and incident records in PostgreSQL. The unique nullable incident deduplication key allows only one active incident per service and failure type; resolving an incident releases that key so a later occurrence creates a new record. Docker inspection errors other than a confirmed missing container are logged and leave the last service observation unchanged. V1 records and displays failures but does not attempt recovery.

## API endpoints

The Compose backend API is available on `http://localhost:3001` by default (`BACKEND_PORT` can change the host port).

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Backend health |
| `GET` | `/api/services` | List monitored services and current status |
| `GET` | `/api/services/:id` | Get one service |
| `GET` | `/api/incidents?page=1&limit=20&status=ACTIVE` | Paginated incidents; `status` is optional (`ACTIVE` or `RESOLVED`) |
| `GET` | `/api/incidents/:id` | Get one incident with its service |

Successful responses use a `data` field. Incident lists also return `pagination` metadata. Invalid IDs or query values return HTTP 400; missing records return HTTP 404. Timestamps are serialized as ISO 8601 UTC values.

The values in `.env.example` are for local development only. Change the database password for your machine and keep `.env` private. Compose binds PostgreSQL to loopback port 5433 for running Prisma migrations from the host; change `DATABASE_HOST_PORT` if needed. `FRONTEND_ORIGINS` controls the backend's allowlisted CORS origins. The Docker socket is mounted into the backend because its monitoring worker needs Docker Engine inspection. `DOCKER_GID` in `.env` must match `stat -c '%g' /var/run/docker.sock` so the non-root backend user can access the socket; update the example value on hosts with a different group ID. Socket access is highly privileged and can effectively grant control over the Docker host; the current code uses it only to inspect the explicitly configured targets, but the mount itself is not a Docker API permission filter. It is never mounted into the frontend or demo app.
