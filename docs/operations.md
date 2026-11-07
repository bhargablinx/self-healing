# Operations and data model

## Normal operation

Follow the [local setup guide](configuration.md), then use:

- Dashboard: <http://localhost:5173>
- Demo app: <http://localhost:4000>
- Demo health route: <http://localhost:4000/health>
- Backend health: <http://localhost:3001/api/health>
- Monitor logs: `docker compose logs -f backend`
- Demo logs: `docker compose logs -f demo-app`

The dashboard refreshes data every five seconds. It displays stored observations and incidents; it does not issue control actions.

## Demonstrate stopped-container detection

Keep the demo registered in `MONITORED_CONTAINERS` (the example does this by default). Then:

```bash
docker compose stop demo-app
```

Wait for one or two monitoring cycles. The worker should update the service to `STOPPED`, create one active `CONTAINER_STOPPED` incident, and the dashboard should display it. Restore the app:

```bash
docker compose start demo-app
```

After the health check succeeds, the service should return to `RUNNING`/`HEALTHY` and the incident should become `RESOLVED`. Repeated polls should not create duplicate active incidents.

This is an intentional failure demonstration; do not stop production containers as a test.

## Data model

The schema source is `backend/prisma/schema.prisma`.

### Service

One row represents a configured Docker target. `containerId` is unique and currently stores the Docker container name from `MONITORED_CONTAINERS`. The worker updates `status`, `healthStatus`, and `lastCheckedAt`. `isEnabled=false` causes an existing service to be skipped. The public API currently has no endpoint or dashboard control for changing this field.

### Incident

An incident belongs to a service and records the observed failure type, severity, description, status, detection time, and optional resolution time. The nullable unique `deduplicationKey` prevents multiple active incidents for the same service/type. Resolved rows remain as history.

The service-to-incident relation cascades on service deletion. Deleting a service therefore deletes its incident history too.

### Incident evidence

Evidence is stored in `incident_evidence`, one row per incident and evidence type. Collection failures remain visible through `collectionStatus` and `collectionError`. The incident relation cascades on deletion.

### Diagnosis

Each rule-based diagnosis run appends a row to `diagnoses`. Records include the category, probable cause, explanation, confidence, evidence supporting the result, missing evidence, method, and creation time. Multiple runs per incident are retained as history. The diagnosis engine currently has no HTTP endpoint or dashboard action; those are planned next.

## Persistence and migrations

Compose stores PostgreSQL data in the named `postgres_data` volume. `docker compose down` preserves it; `docker compose down -v` removes it. Back up data before deleting volumes or changing schema.

The backend container runs `prisma migrate deploy` when it starts. For backend schema development, from `backend/` use:

```bash
npm run prisma:migrate -- --name describe_change
npm run prisma:generate
```

Commit migration files under `backend/prisma/migrations/`. Do not edit an already-applied migration to change an existing database.

## Current limitations

- The worker only inspects explicitly configured Docker container names.
- The API and dashboard are read-only; service registration and enable/disable controls are not exposed.
- A missing target (Docker 404) is treated as unavailable. Other Docker inspection errors are logged and do not alter the previous observation or create an incident.
- A running container with no Docker health check is `NOT_CONFIGURED`, not unhealthy.
- There is no authentication, authorization, LLM analysis, automatic restart, rollback, or shell command execution. Rule-based diagnoses are persisted but not yet exposed in the API or dashboard.
- Service status represents the latest successful observation and can be stale during monitoring errors.
