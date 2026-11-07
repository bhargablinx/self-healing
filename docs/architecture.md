# Architecture

## Components

| Component | Location | Responsibility |
| --- | --- | --- |
| Dashboard | `frontend/` | React + TypeScript UI; reads service and incident data and refreshes every five seconds. |
| REST API | `backend/src/api/` | Express endpoints for health, services, and incidents. |
| Monitoring worker | `backend/src/monitoring/` | Uses Dockerode to inspect configured containers on a polling interval. |
| Detection engine | `backend/src/detection/` | Emits events when a service enters or leaves a failure condition. |
| Incident service | `backend/src/incidents/` | Persists, deduplicates, and resolves incidents using Prisma. |
| Evidence collector | `backend/src/diagnosis/evidence-collector.ts` | Asynchronously stores bounded, sanitized Docker state, health, metadata, and logs for newly detected incidents. |
| Failure classifier | `backend/src/diagnosis/failure-classifier.ts` | Pure, deterministic mapping from incident evidence to a supported failure category; diagnosis execution is not yet wired. |
| Database | PostgreSQL | Stores service observations, incident history, and incident evidence. |
| Demo app | `demo-app/` | Small HTTP service with `/` and `/health` routes. |

```text
Docker Engine -> monitoring worker -> detection -> incident service -> Prisma -> PostgreSQL
                       |                                     |
                       +-> evidence collector ---------------+
Dashboard -> Express read API -------------------------------------------------+
```

## Monitoring cycle

1. The worker reads the comma-separated `MONITORED_CONTAINERS` allowlist.
2. For each target, it checks whether a stored service has `isEnabled=false`. Disabled services are skipped.
3. Docker inspection results update the service's observed state, health, and `lastCheckedAt` timestamp.
4. A stopped, unhealthy, or confirmed missing container is reconciled into an incident. A healthy observation resolves active incidents for that service.
5. When a failure transition is detected, the worker schedules evidence collection after incident persistence and does not wait for collection to finish.
6. The dashboard polls the read API and displays the latest stored service and incident data. Evidence read endpoints and dashboard presentation are planned for later V2-A phases.

Evidence is stored in `incident_evidence`, with one row per incident and evidence type. Recent stdout/stderr logs are bounded by `EVIDENCE_LOG_TAIL_LINES` and `EVIDENCE_LOG_MAX_BYTES`; collection operations use `EVIDENCE_COLLECTION_TIMEOUT_MS`. Docker environment variables are not collected. Common credential patterns are redacted from logs and Docker error/health text. Individual collection failures are stored on the evidence row and do not prevent incident creation.

The default polling interval is five seconds. `MONITOR_INTERVAL_MS` sets the interval, with a minimum of one second enforced by configuration validation.

## Failure mapping

| Observation | Service status | Health status | Incident type | Default severity |
| --- | --- | --- | --- | --- |
| Container stopped | `STOPPED` | Observed health or `NOT_CONFIGURED` | `CONTAINER_STOPPED` | `HIGH` |
| Container running and Docker health is unhealthy | `RUNNING` | `UNHEALTHY` | `CONTAINER_UNHEALTHY` | `HIGH` |
| Docker confirms target is missing (HTTP 404) | `UNAVAILABLE` | `UNKNOWN` | `CONTAINER_UNAVAILABLE` | `MEDIUM` |
| Other Docker inspection error | Previous observation retained | Previous observation retained | No incident created from that error | N/A |

For a running container without a Docker health check, health is `NOT_CONFIGURED`; that alone is not a failure.

## Incident lifecycle and deduplication

Only one active incident per service and incident type is allowed by the unique nullable `deduplicationKey`. Repeated polls reuse the active incident. On recovery, the incident becomes `RESOLVED`, its `resolvedAt` is set, and the key is cleared. A later occurrence can create a new incident. If the detected failure changes type, the previous type is resolved before the new type is recorded.

The detection engine also suppresses repeated transition logs in memory. Database deduplication remains effective across backend restarts.

## Compose services and ports

Compose provides four services: `database`, `backend`, `demo-app`, and `frontend`.

| Service | Host URL or port |
| --- | --- |
| Dashboard | `http://localhost:5173` |
| API | `http://localhost:3001` |
| Demo app | `http://localhost:4000` |
| PostgreSQL | `localhost:5433`, bound to loopback |

Within the Compose network, the backend connects to PostgreSQL at `database:5432`. The API listens on port 3000 inside its container. The dashboard is built with the host-facing API URL and served as static files by Nginx.
