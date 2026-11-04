# Self-Healing Software

V1 detects failures in explicitly monitored Docker containers, stores incidents in PostgreSQL, and displays them in a dashboard. V1 does not use AI or perform automatic recovery. See [context.md](context.md) for project scope and safety requirements.

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

When running directly with `npm run dev`, the API health endpoint is `GET http://localhost:3000/api/health`. Configure the server port and database URL in `backend/.env`. The initial Prisma models describe services and incidents; monitoring and data endpoints will be added in later phases.

## Run the demo and database with Docker Compose

This phase includes PostgreSQL, the backend, and the demo service. The React frontend will be added to Compose when its setup begins.

```bash
cp .env.example .env
docker compose up --build -d
docker compose ps
```

Check the demo at `http://localhost:4000/` and `http://localhost:4000/health`; check the Compose backend at `http://localhost:3001/api/health` by default. Set `BACKEND_PORT` in `.env` to change the host port. Stop the stack with `docker compose down`. The named `postgres_data` volume keeps the database when containers are recreated; `docker compose down -v` also deletes that data.

The values in `.env.example` are for local development only. Change the database password for your machine and keep `.env` private. The Docker socket grants powerful control over the Docker host. It is not mounted into any container in this phase. When monitoring is added, socket access will be confined to the backend monitoring component; it will never be given to the frontend or demo app.
