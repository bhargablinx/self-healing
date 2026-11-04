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

When running directly with `npm run dev`, the API health endpoint is `GET http://localhost:3000/api/health`. Configure the server port and database URL in `backend/.env`. To monitor locally, also set `MONITORED_CONTAINERS` to a comma-separated allowlist and make sure the process can access the Docker socket.

## Run the demo and database with Docker Compose

This phase includes PostgreSQL, the backend, and the demo service. The React frontend will be added to Compose when its setup begins.

```bash
cp .env.example .env
docker compose up --build -d
docker compose ps
```

Check the demo at `http://localhost:4000/` and `http://localhost:4000/health`; check the Compose backend at `http://localhost:3001/api/health` by default. Set `BACKEND_PORT` in `.env` to change the host port. Stop the stack with `docker compose down`. The named `postgres_data` volume keeps the database when containers are recreated; `docker compose down -v` also deletes that data.

After the updated backend image is built, it monitors only names listed in `MONITORED_CONTAINERS` (the example defaults to `self-healing-demo-app`). To see monitor output, run `docker compose logs -f backend`. You can demonstrate detection with `docker compose stop demo-app`, then restore the demo with `docker compose start demo-app`. Repeated polls of the same failure are suppressed while the backend process stays up; the detection state is currently in memory and is not an incident record.

The current monitor updates service telemetry in PostgreSQL and logs detected/cleared failure conditions. Creating persistent incidents and exposing service/incident API endpoints are the next phase. Docker inspection errors other than a confirmed missing container are logged and leave the last service observation unchanged.

The values in `.env.example` are for local development only. Change the database password for your machine and keep `.env` private. The Docker socket is mounted into the backend because its monitoring worker needs Docker Engine inspection. `DOCKER_GID` in `.env` must match `stat -c '%g' /var/run/docker.sock` so the non-root backend user can access the socket; update the example value on hosts with a different group ID. Socket access is highly privileged and can effectively grant control over the Docker host; the current code uses it only to inspect the explicitly configured targets, but the mount itself is not a Docker API permission filter. It is never mounted into the frontend or demo app.
