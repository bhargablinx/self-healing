# Configuration and local setup

## Requirements

- Docker Engine with Compose v2 (`docker compose`).
- A working Docker Engine socket at `/var/run/docker.sock` for container monitoring.
- On Linux, the backend container needs the socket's group ID. Find it with `stat -c '%g' /var/run/docker.sock` and put that number in `DOCKER_GID` in the root `.env`. The example value is machine-specific.

## Start the project

From the repository root:

```bash
cp .env.example .env
```

Set `DOCKER_GID` as described above, then start the stack:

```bash
docker compose up --build -d
docker compose ps
```

Open <http://localhost:5173>. Confirm the API at <http://localhost:3001/api/health> returns `{"data":{"status":"ok"}}`.

Stop the stack with `docker compose down`. The named PostgreSQL volume persists. To delete the local database as well, use `docker compose down -v`.

## Root environment variables

Values are read from the root `.env` and interpolated by `docker-compose.yml`.

| Variable | Default | Purpose |
| --- | --- | --- |
| `POSTGRES_USER` | `self_healing` | PostgreSQL role for the local Compose database. |
| `POSTGRES_PASSWORD` | `local_dev_password` | Local-only database password. Change for your machine. |
| `POSTGRES_DB` | `self_healing` | Database created by the PostgreSQL container. |
| `DATABASE_HOST_PORT` | `5433` | Host port for PostgreSQL; bound to `127.0.0.1`. |
| `BACKEND_PORT` | `3001` | Host port mapped to backend container port 3000. |
| `FRONTEND_PORT` | `5173` | Host port mapped to Nginx port 80. |
| `FRONTEND_ORIGINS` | `http://localhost:5173,http://127.0.0.1:5173` | Comma-separated backend CORS allowlist. |
| `DEMO_APP_PORT` | `4000` | Host port mapped to the demo app. |
| `MONITORED_CONTAINERS` | `self-healing-demo-app` | Comma-separated Docker container names to inspect. |
| `MONITOR_INTERVAL_MS` | `5000` | Poll interval in milliseconds; minimum 1000. |
| `EVIDENCE_LOG_TAIL_LINES` | `100` | Maximum recent Docker log lines collected for a new incident (1–1000). |
| `EVIDENCE_LOG_MAX_BYTES` | `65536` | Maximum stored log bytes per incident (1024–1000000). |
| `EVIDENCE_COLLECTION_TIMEOUT_MS` | `5000` | Overall Docker evidence collection timeout (500–30000 ms). |
| `DOCKER_GID` | `129` | Supplemental group ID for Docker socket access inside the backend container. |

Incident evidence is collected asynchronously after a newly detected failure has been persisted. Collection errors are stored with the affected evidence item. Log content is bounded and common credential patterns are redacted. Container environment variables are not collected.

When changing `BACKEND_PORT`, rebuild the frontend image so Vite embeds the matching API URL:

```bash
docker compose build frontend
docker compose up -d frontend
```

If `FRONTEND_PORT` changes, also update `FRONTEND_ORIGINS` to include the corresponding dashboard origin, then recreate the backend.

## Backend-only local development

Compose is the simplest way to run the complete system. To work on the backend directly, use Node.js 22 and a reachable PostgreSQL database:

```bash
cd backend
cp .env.example .env
npm install
npm run prisma:generate
npm run prisma:migrate -- --name init
npm run dev
```

Set `DATABASE_URL` to the database you intend to use. Compose PostgreSQL is published on host port 5433; host PostgreSQL on port 5432 is a separate database. To monitor Docker from the host process, set `MONITORED_CONTAINERS` and ensure the process can access the Docker socket. The local API defaults to port 3000.

## Troubleshooting

### Port is already in use

Change the relevant `*_PORT` value in `.env`, then recreate the affected service. If `BACKEND_PORT` changes, rebuild the frontend as shown above.

### Backend cannot access Docker

Check that `/var/run/docker.sock` exists and that `DOCKER_GID` matches its group ID. Restart the backend after changing `.env`:

```bash
docker compose up -d --force-recreate backend
docker compose logs -f backend
```

Docker socket access is highly privileged; see [Development and security](development.md).

### Database credentials fail

Compose uses the root `.env` values when it creates a new database volume. If a persistent volume was initialized earlier with different credentials, changing `.env` does not change the database role or password inside that existing volume. Either update the PostgreSQL role credentials or, only if the local data can be discarded, remove the volume with `docker compose down -v` and start again.

### Docker image dependency installation stalls

The backend Dockerfile installs dependencies using `npm ci`. In this environment, one no-cache build attempt returned npm `ECONNRESET` during a registry read; a no-cache retry then completed dependency installation, Prisma generation, and compilation successfully. Clean installs also succeeded on the host and in a fresh Node 22 container, so the cause of the first reset was not established. If it recurs, inspect with `docker compose --progress plain build --no-cache backend`, check npm registry/network access, and retry. Do not assume an old locally tagged backend image contains current source changes; verify the image build and container logs after rebuilding.
