# Development, verification, and security

## Repository layout

```text
backend/       Express API, monitoring worker, Prisma schema and migrations
demo-app/      Small Node.js demo service
docs/          Project usage and architecture guides
frontend/      React + TypeScript dashboard, built with Vite and Tailwind CSS
context.md     Project scope, constraints, roadmap and verified status
docker-compose.yml
```

## Backend development

Use Node.js 22. In `backend/`, configure `.env` with a reachable PostgreSQL URL, then:

```bash
npm install
npm run prisma:generate
npm run dev
```

Useful scripts:

| Command | Purpose |
| --- | --- |
| `npm run build` | Compile TypeScript into `dist/`. |
| `npm run typecheck` | Type-check without emitting build files. |
| `npm run prisma:generate` | Generate the client from `prisma/schema.prisma`. |
| `npm run prisma:migrate -- --name name` | Create/apply a development migration. |
| `npm run prisma:migrate:deploy` | Apply committed migrations in a deployment environment. |

The Prisma 7 config reads `DATABASE_URL` from `backend/.env` through `prisma.config.ts`.

## Frontend development

In `frontend/`:

```bash
npm install
npm run dev
```

Vite serves the development UI on port 5173. Set `VITE_API_BASE_URL` in `frontend/.env` if the backend is not at `http://localhost:3001`. For a static build:

```bash
npm run build
npm run preview
```

The Compose frontend build embeds its backend URL using `BACKEND_PORT` at image-build time. Rebuild the frontend image after changing that port.

## Manual verification record

The documented project state has been manually exercised for:

- Compose startup and health endpoints.
- Demo stop/restart, incident creation/deduplication, resolution, and dashboard display.
- Invalid resource IDs and invalid incident pagination/status values returning HTTP 400.
- Disabled services being skipped by the monitor.
- An unhealthy container creating a `CONTAINER_UNHEALTHY` incident.
- A transient Docker socket error preserving the previous service state and creating no incident.

The unhealthy and monitoring-error checks used isolated temporary containers and rows; those resources were cleaned up. Twenty-eight automated backend regression tests are in `backend/tests/`, using Node's built-in test runner and the existing `tsx` dependency. Run them with `cd backend && npm test`. They cover failure transitions, incident reconciliation behavior, disabled services, transient Docker errors, confirmed missing containers, evidence scheduling/sanitization, deterministic failure classification, diagnosis rules, and diagnosis persistence orchestration. The tests use injected fakes and do not require a database or Docker daemon.

V2-A Phase 1 adds an additive `IncidentEvidence` migration and asynchronously collects bounded container state, exit/OOM information, health-check details, restart count, metadata, and recent stdout/stderr logs. Evidence is uniquely upserted per incident and evidence type. The Compose database migration has been applied without resetting existing data. The clean backend image and runtime were verified, including successful persistence of all six evidence types for the existing stopped-container incident.

V2-A Phase 2 adds the pure `classifyFailure` module in `backend/src/diagnosis/failure-classifier.ts`. It returns one of the six specified categories and an evidence-grounded explanation/indicator list. It ignores evidence marked `FAILED`, requires explicit `OOMKilled=true` for OOM classification, and returns `UNKNOWN_FAILURE` when available evidence is insufficient. Diagnosis persistence and API/UI integration belong to later phases.

V2-A Phase 3 adds modular deterministic rules and `diagnoseIncident` in `backend/src/diagnosis/`. The engine loads a persisted incident and its evidence, validates the diagnosis result, then appends a record in the `diagnoses` table. The additive migration has been applied without resetting data. A live rule-based diagnosis was persisted for the existing stopped-container incident. The API and dashboard do not expose diagnoses yet.

## Security boundaries

- The backend receives `/var/run/docker.sock` because it uses Dockerode. Docker socket access is highly privileged and can effectively grant control over the host Docker daemon. The target allowlist is an application behavior, not a Docker API permission filter.
- The socket is not mounted into the frontend or demo application.
- The API has no authentication or authorization. It is intended for local development and must not be exposed to an untrusted network as configured.
- CORS limits browser origins; it is not authentication and does not restrict non-browser clients.
- Keep `.env` files private. Values in `.env.example` are local-development placeholders only.
- PostgreSQL is published on loopback by Compose. Backend and frontend published ports bind to all host interfaces by default; use host firewalling or local-only port bindings on an untrusted network.
- The system records failures for manual review and does not attempt recovery.
