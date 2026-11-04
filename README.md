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

The API health endpoint is `GET http://localhost:3000/api/health`. Configure the server port and database URL in `backend/.env`. The initial Prisma models describe services and incidents; monitoring and data endpoints will be added in later phases.
