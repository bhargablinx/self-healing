# Project Context: Self-Healing Software

> **Purpose:** This file gives developers and AI coding agents the current project goals, V1 scope, architecture, technology choices, constraints, and development direction.
>
> **Project status:** V1 and V2 Phase 0 stabilization are complete. V2-A Phases 1–5 (evidence collection, classification, diagnosis/persistence, API, and dashboard presentation) are implemented. The Compose frontend is healthy and serves the updated bundle; final browser-level integration acceptance remains.

---

## 1. Project Identity

- **Project title:** Self-Healing Software – AI-Based Autonomous System Recovery
- **Repository name:** `self-healing-software`
- **Project type:** College major project / academic software engineering project

### Project vision

The long-term vision is a platform that monitors containerized applications, detects failures, investigates incidents, recommends or performs controlled recovery actions, and verifies recovery.

**Important:** The long-term vision is broader than the current implementation. V1 is deliberately limited to monitoring, failure detection, incident creation, and dashboard display. It does not perform AI-based diagnosis or recovery.

---

## 2. Problem Being Addressed

Applications often consist of multiple services running in containers. When a service stops, becomes unhealthy, or is unavailable, users may experience application errors or downtime. Developers and operators need to notice the failure and investigate it.

This project begins by building a small monitoring and incident-tracking platform that can detect selected Docker container failures and make them visible through a web dashboard.

The long-term project may reduce manual incident response. The first version establishes the reliable detection and incident-recording foundation needed before considering more advanced features.

---

## 3. Current V1 Scope

### V1 workflow

The only required V1 workflow is:

1. A monitored Docker container experiences a failure.
2. The monitoring worker observes the container state.
3. The detection engine identifies the failure condition.
4. The incident manager creates and persists an incident in PostgreSQL.
5. The React dashboard displays the affected service and incident.

**V1 ends at incident visibility.** It does not attempt to repair the failure.

### V1 must-have capabilities

1. Monitor a small set of registered Docker containers.
2. Read container state and health status using the Docker Engine API.
3. Detect a container that has stopped, exited unexpectedly, become unhealthy, or become unavailable.
4. Create and persist an incident when a supported failure is detected.
5. Prevent duplicate active incidents for the same ongoing failure.
6. Display service status and incidents in a web dashboard.
7. Refresh dashboard data periodically so new incidents appear without a manual page reload.
8. Update service status when a container starts or becomes healthy again.
9. Maintain clear incident timestamps and lifecycle status.
10. Handle temporary monitoring errors without incorrectly declaring a service failed.

### Explicitly out of scope for V1

Do not implement these in V1:

- AI, machine learning, or LLM integration.
- Autonomous agents or agent frameworks.
- Root-cause analysis beyond identifying the observed failure condition.
- Automatic restart or any other automated recovery action.
- Rollback or recovery planning.
- Arbitrary shell command execution.
- CPU/memory anomaly detection or complex threshold analytics.
- Kubernetes integration.
- Prometheus, Grafana, Loki, or distributed tracing unless later explicitly approved.
- Complex multi-service dependency analysis.

These are possible future extensions. Do not add them merely because they appear in the project's long-term title or vision.

### Initial failure scenarios

Prioritize:

- A monitored container is stopped or exits.
- A monitored container reports an unhealthy state.
- A monitored container cannot be inspected or is otherwise unavailable, after distinguishing a genuine target failure from a temporary Docker/monitoring error.

Do not treat an intentional stop or a disabled/unregistered service as an unexpected failure. Provide a clear way to mark whether a service is enabled for monitoring.

---

## 4. Technology Stack

Use this stack for V1:

| Layer                 | Technology                           | Purpose                                                     |
| --------------------- | ------------------------------------ | ----------------------------------------------------------- |
| Backend runtime       | Node.js                              | Run the backend                                             |
| Backend language      | TypeScript                           | Typed backend implementation                                |
| Backend framework     | Express.js                           | REST API                                                    |
| Frontend              | React + TypeScript                   | Web dashboard                                               |
| Frontend tooling      | Vite                                 | Development and build tooling                               |
| Styling               | Tailwind CSS                         | UI styling                                                  |
| Database              | PostgreSQL                           | Store services and incidents                                |
| ORM                   | Prisma ORM                           | Typed database access and schema management                 |
| Container integration | Docker SDK for Node.js (`dockerode`) | Inspect monitored containers                                |
| Validation            | Zod                                  | Validate external input and configuration where appropriate |
| Local orchestration   | Docker Compose                       | Run the development environment                             |
| Version control       | Git + GitHub                         | Source control                                              |

### Prisma requirements

- Use the official Prisma Client for JavaScript/TypeScript.
- Keep `schema.prisma` as the database schema source of truth.
- Generate Prisma Client as part of the documented development workflow.
- Use Prisma migrations for schema changes.
- Use Prisma relations, enums, constraints, and indexes where appropriate.
- Keep database access in a dedicated data/service layer, not scattered through Express route handlers.
- Reuse a configured Prisma Client instance rather than creating unnecessary clients/connections.
- Do not use SQLAlchemy, Alembic, or another ORM.
- Do not silently replace Prisma. If a concrete compatibility or tooling issue arises, explain it and ask before changing the selected ORM.

### Version and dependency guidance

Choose mutually compatible, stable versions of Node.js, TypeScript, Express, Prisma, and PostgreSQL. Check the current Prisma setup requirements when implementing the project; do not rely on outdated commands or configuration examples. Keep dependencies minimal.

---

## 5. V1 Architecture

```text
                 MONITORED APPLICATION
                  Docker container(s)
                          |
                          v
                 DOCKER ENGINE / API
                          |
                          v
                  MONITORING WORKER
                    (dockerode)
                          |
                          v
                   DETECTION ENGINE
                          |
                          v
                   INCIDENT MANAGER
                          |
                          v
                     PRISMA ORM
                          |
                          v
                      POSTGRESQL
                          ^
                          |
                   EXPRESS REST API
                          |
                          v
                   REACT DASHBOARD
```

### Component responsibilities

**Monitoring worker**

- Connect to Docker Engine using `dockerode`.
- Inspect only configured/registered containers.
- Periodically collect container state and health information.
- Record the time of the latest successful check.
- Distinguish monitoring/Docker API errors from confirmed container failures.

**Detection engine**

- Evaluate observations using explicit deterministic rules.
- Detect supported failure states.
- Avoid duplicate active incidents for one continuing failure.
- Ignore disabled or intentionally unmanaged services.
- Avoid creating incidents based on a single transient monitoring error.
- Keep the initial rules simple and testable.

**Incident manager**

- Create incidents for detected failures.
- Persist incidents using Prisma.
- Update incident status and resolution timestamp when the service returns to a healthy state, according to a clearly documented lifecycle.
- Ensure repeated monitoring cycles do not create duplicate active incidents.

**Express API**

- Expose service and incident information to the frontend.
- Validate route parameters and query inputs.
- Return consistent JSON responses and appropriate HTTP status codes.
- Use centralized error handling.
- Keep route handlers thin; put business logic in service modules.

**React dashboard**

- Fetch real data from the Express API.
- Display current service status and incident records.
- Refresh periodically or use another appropriately simple update mechanism.
- Include loading, empty, and error states.
- Do not use hardcoded mock data as the finished implementation.

---

## 6. Initial Data Model

Keep the V1 database small. Start with two main models and add fields only when justified.

### Service

Suggested fields:

- `id`
- `name`
- `containerId` — Docker container ID or stable configured identifier
- `status` — observed container state, such as running, exited, or unavailable
- `healthStatus` — health information where Docker health checks are configured
- `isEnabled` — whether this service should be monitored
- `lastCheckedAt`
- `createdAt`
- `updatedAt`

### Incident

Suggested fields:

- `id`
- `serviceId`
- `incidentType`
- `severity`
- `description`
- `status` — for example, active or resolved
- `detectedAt`
- `resolvedAt` (nullable)
- `createdAt`
- `updatedAt` if useful

### Data model rules

- One service can have many incidents.
- Use a Prisma relation between `Service` and `Incident`.
- Use appropriate indexes for service lookups, incident status, and timestamps.
- Prevent duplicate active incidents for the same service and failure type through carefully designed application logic and database constraints where practical.
- Define status/severity values consistently, preferably with Prisma enums where suitable.
- Store timestamps consistently and document the timezone handling.
- Do not add recovery actions, recovery attempts, AI analysis, or audit models to V1 unless a real V1 requirement emerges.

---

## 7. REST API

Implement these initial endpoints:

### Services

- `GET /api/services` — list monitored services and their latest status.
- `GET /api/services/:id` — retrieve one service.

### Incidents

- `GET /api/incidents` — list incidents; add pagination and optional status filtering if practical.
- `GET /api/incidents/:id` — retrieve one incident, including relevant service information.

### System

- `GET /api/health` — report backend/API health.

### API requirements

- Use appropriate HTTP status codes.
- Validate IDs and query parameters.
- Return consistent JSON response structures.
- Implement centralized error handling.
- Do not expose internal stack traces or secrets in API responses.
- Document endpoints in the README; add OpenAPI documentation only if it can be done simply and reliably.

---

## 8. Frontend Dashboard

### Design direction

- White background.
- Black or dark text.
- Subtle borders and restrained shadows.
- Clear status labels/indicators.
- Simple, readable layout.
- Avoid unnecessary animations and decorative complexity.

### Overview

Display:

- Total monitored services.
- Healthy services.
- Unhealthy/stopped services.
- Active incidents.
- Recent incidents.

### Services view

For each service, display:

- Service name.
- Container ID (shortened in the UI if necessary).
- Current container status.
- Health status.
- Enabled/disabled monitoring state where useful.
- Last checked timestamp.

### Incidents view

For each incident, display:

- Incident ID.
- Affected service.
- Incident type.
- Severity.
- Incident status.
- Detection timestamp.

### Incident details

Display:

- Incident description.
- Affected service.
- Failure type and severity.
- Detection time.
- Current incident status.
- Resolution time, if resolved.

### Frontend behaviour

- Connect to the real Express API.
- Poll or refresh at a reasonable interval so new incidents appear automatically.
- Avoid unnecessary requests and clean up polling when components unmount.
- Show useful loading, empty, and error states.
- Do not imply that the system automatically repaired a failed service.

---

## 9. Demo Application and Failure Demonstration

Create one small demo application running in a Docker container. It can use Node.js/Express or another simple technology.

It should expose:

- `GET /` — returns a basic response.
- `GET /health` — returns a health status.

The demo should be easy to start, stop, and restart using Docker Compose or Docker commands.

### Expected demonstration

1. Start the project using Docker Compose.
2. Open the dashboard and confirm the demo service is shown as healthy/running.
3. Stop the demo container intentionally while it remains enabled for monitoring.
4. The monitoring worker observes the stopped/exited state.
5. The detection engine identifies the failure.
6. The incident manager creates one incident and stores it in PostgreSQL through Prisma.
7. The dashboard displays the incident without a manual page reload.
8. Restart the demo container.
9. The service status updates to running/healthy.
10. The incident lifecycle is updated consistently, for example by marking the incident resolved and recording `resolvedAt`, if that is the chosen lifecycle rule.

Be explicit in the UI and documentation that the user manually restarted the container. The project did not perform automatic recovery.

---

## 10. Docker Compose and Security

The development environment should include:

1. Express backend.
2. React frontend.
3. PostgreSQL database.
4. Demo application container.

Requirements:

- Use environment variables for configuration.
- Provide `.env.example` with placeholder values only.
- Use a named Docker volume for persistent PostgreSQL data.
- Configure service dependencies and health checks where useful.
- Use Docker Compose service names for container-to-container communication.
- Document how to start, stop, and inspect the environment.

### Docker socket security

- Docker socket access must be limited to the backend monitoring component that needs it.
- Never expose Docker socket access to the frontend.
- Do not give the demo application Docker socket access.
- Document that access to the Docker socket is highly privileged and can effectively grant control over the Docker host.
- Do not add arbitrary command execution or container-management endpoints to the public API.
- Monitor only explicitly configured containers.

---

## 11. Suggested Repository Structure

Adapt this to the actual repository. Do not create empty folders or files solely to match the diagram.

```text
self-healing-software/
├── backend/
│   ├── src/
│   │   ├── api/
│   │   │   ├── routes/
│   │   │   ├── controllers/
│   │   │   └── middleware/
│   │   ├── monitoring/
│   │   │   ├── docker-client.ts
│   │   │   ├── monitor.ts
│   │   │   └── worker.ts
│   │   ├── detection/
│   │   │   └── detection-engine.ts
│   │   ├── incidents/
│   │   │   └── incident-service.ts
│   │   ├── services/
│   │   ├── config/
│   │   ├── lib/
│   │   ├── app.ts
│   │   └── server.ts
│   ├── prisma/
│   │   └── schema.prisma
│   ├── tests/
│   ├── package.json
│   └── tsconfig.json
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── services/
│   │   ├── hooks/
│   │   └── types/
│   ├── package.json
│   └── ...
├── demo-app/
│   ├── src/
│   ├── Dockerfile
│   └── package.json
├── docker-compose.yml
├── .env.example
├── .gitignore
├── README.md
└── context.md
```

The monitoring worker may initially run as part of the backend codebase, but keep its logic separated from Express route handling. If it is run as a separate process/container later, ensure it does not create duplicate monitoring loops.

---

## 12. Development Roadmap

Build and verify the project incrementally.

### Phase 1 — Repository inspection and planning

- Inspect the existing repository and current Git state.
- Read `context.md` and `README.md` if present.
- Identify what already exists and what is missing.
- Present a concise implementation plan before editing files.

**Deliverable:** A repository-specific plan, not an assumed or regenerated project.

### Phase 2 — Backend and database foundation

- Set up Node.js, Express, and TypeScript.
- Configure PostgreSQL.
- Configure Prisma and `schema.prisma`.
- Generate Prisma Client and create the initial migration.
- Add the Express health endpoint.
- Verify database connectivity.

**Deliverable:** Express backend can connect to PostgreSQL through Prisma.

### Phase 3 — Demo application and Compose

- Create the demo application and health endpoint.
- Add Dockerfiles as needed.
- Configure Docker Compose for the backend, frontend, database, and demo service.
- Verify all required containers start.

**Deliverable:** A working local environment with a healthy demo container.

### Phase 4 — Monitoring and detection

- Integrate `dockerode`.
- Implement monitoring of explicitly configured containers.
- Implement deterministic failure detection.
- Handle temporary monitoring errors and disabled services.
- Prevent duplicate active incidents.

**Deliverable:** Stopping the demo container results in one detected failure.

### Phase 5 — Incident persistence and API

- Implement incident creation and lifecycle updates.
- Persist service and incident records through Prisma.
- Implement service and incident endpoints.
- Add validation and centralized error handling.
- Test the API.

**Deliverable:** The API returns real service and incident data from PostgreSQL.

### Phase 6 — Frontend dashboard

- Set up React, TypeScript, Vite, and Tailwind.
- Build the overview, services, and incidents views.
- Connect to the Express API.
- Add polling/refresh and loading, empty, and error states.

**Deliverable:** The dashboard displays live backend data and newly created incidents.

### Phase 7 — End-to-end testing and documentation

- Run the full stop-container demonstration.
- Verify incident creation and duplicate prevention.
- Restart the demo container and verify status/lifecycle updates.
- Document setup, commands, architecture, limitations, and test results.

**Deliverable:** A repeatable V1 demonstration.

Do not move into future AI or recovery phases until V1 is complete and tested.

---

## 13. V1 Acceptance Criteria

V1 is complete when all of the following are demonstrated:

- [x] The project starts using documented Docker Compose commands. A no-cache backend image build and the full `docker compose up --build -d` command both succeeded on 2026-11-07. One earlier no-cache build attempt returned npm `ECONNRESET`; retry succeeded without Dockerfile changes.
- [x] PostgreSQL data persists in the named Compose volume across container recreation.
- [x] The backend connects to PostgreSQL through Prisma.
- [x] The demo application appears in the dashboard as healthy/running.
- [x] Stopping the enabled demo container is detected.
- [x] A corresponding incident is created and persisted.
- [x] The dashboard displays the incident automatically through polling/refresh.
- [x] Incident details expose the correct service, type, status, and timestamps.
- [x] Repeated checks do not create duplicate active incidents for the same ongoing failure.
- [x] Disabled or intentionally unmanaged services are not reported as unexpected failures.
- [x] Temporary monitoring errors are not immediately misclassified as confirmed container failures.
- [x] Restarting the demo container updates its service status and the incident lifecycle consistently.
- [x] The UI does not claim that automated recovery occurred.
- [x] The README explains setup, default configuration, demonstration steps, and known limitations, with links to detailed docs.

---

## 14. Working Principles for AI Coding Agents

Any AI coding agent contributing to this repository must:

- Read this `context.md` and the current `README.md` before making changes.
- Inspect the existing repository before proposing or creating files.
- Treat the actual codebase and executed tests as the source of truth for implementation status.
- Remember that this document describes intended direction, not proof that features exist.
- Work in small, testable increments.
- Explain important architectural and dependency decisions in beginner-friendly language.
- Use TypeScript consistently in the backend and frontend.
- Avoid unnecessary `any`; define useful types.
- Validate external inputs and environment configuration.
- Keep secrets in environment variables; never commit `.env` or API keys.
- Update `.env.example` when adding configuration variables, using placeholders only.
- Use Prisma for database access and migrations. Do not substitute SQLAlchemy, Alembic, or another ORM.
- Keep monitoring, detection, incident logic, API routing, and database access separated by responsibility.
- Add tests for detection rules, incident deduplication, and incident lifecycle behaviour.
- Do not claim tests pass unless they were actually run.
- Do not invent metrics, research results, implementation status, or citations.
- Avoid unnecessary libraries, microservices, and infrastructure.
- Do not add AI, ML, LLMs, autonomous agents, automatic recovery, or rollback to V1.
- Do not add arbitrary shell execution or unrestricted infrastructure access.
- Keep documentation aligned with the actual implementation.
- At the end of each task, summarize files changed, commands run, test results, and known limitations.
- Wait for the student's confirmation before moving to the next major development phase.

---

## 15. Current Project Status and Immediate Next Steps

**Current direction:** The project is a college major project in early implementation. The long-term vision is AI-assisted autonomous recovery, but the current V1 is intentionally restricted to detecting Docker container failures, creating incidents, and displaying them in a dashboard.

**Current V1 stack:**

- Node.js + Express + TypeScript
- React + TypeScript + Vite
- Tailwind CSS
- PostgreSQL
- Prisma ORM
- Docker + Docker Compose
- `dockerode` for Docker monitoring
- Zod for validation where appropriate

### Verified implementation status (updated 2026-11-08)

- Repository inspection is complete. The project-specific README and this context file are present.
- Backend foundation is implemented in `backend/` using Express 5, TypeScript, Zod, and Prisma 7 with the PostgreSQL driver adapter.
- Prisma Client is generated from `backend/prisma/schema.prisma`. The `Service` and `Incident` models, enums, relation, and indexes are defined.
- The initial Prisma migration and the incident deduplication migration have been applied to both the local and Compose PostgreSQL databases. Prisma Client queries from the backend container succeeded.
- `GET /api/health` is implemented and has returned HTTP 200 from both a local backend process on port 3000 and the Compose backend on port 3001.
- A demo application exists in `demo-app/`, with `GET /` and `GET /health`.
- Docker Compose defines PostgreSQL, the backend, demo app, and React dashboard. PostgreSQL has a named persistent volume and health check and binds to loopback port 5433 for host-side Prisma migrations; all application services have health checks. The demo app may be stopped during incident demonstrations.
- The Compose backend defaults to host port 3001 because port 3000 is already used by a local backend process on the development machine. Set `BACKEND_PORT` in the root `.env` to change it.
- Dockerode monitoring code is implemented in `backend/src/monitoring/` and failure transition/deduplication rules are in `backend/src/detection/`. The backend checks only names in `MONITORED_CONTAINERS`, updates service status/health through Prisma, and logs detection and clear events. A 404 for a configured target is treated as unavailable; other Docker errors do not change the last service observation.
- The Docker socket is now mounted into the backend Compose service only. It is not mounted into the demo app. Socket access is highly privileged; code-level target allowlisting does not restrict the Docker daemon API itself.
- Local monitoring was exercised against the Docker demo container: a stop was detected once across repeated polls, and a restart cleared the failure and updated the local service record to `RUNNING`/`HEALTHY`.
- Detections now create incidents in PostgreSQL. Active incidents are unique by a nullable `deduplicationKey`; resolving an incident clears the key, allowing a future occurrence to create a new record. A healthy observation resolves active incidents for the service; a changed failure type resolves the previous type.
- `GET /api/services`, `GET /api/services/:id`, `GET /api/incidents`, and `GET /api/incidents/:id` return database records. Incident lists support `page`, `limit`, and optional `status` filtering.
- API input validation was manually checked in Phase 7: malformed service/incident IDs, invalid pagination (`page=0`, `limit=101`), and an unsupported incident status return HTTP 400 with the centralized validation error shape. Service and incident IDs are checked against the generated Prisma CUID format. The API health endpoint remained HTTP 200; current service state was `RUNNING`/`HEALTHY`, with no active incidents after the user-confirmed dashboard demonstration.
- Disabled-service behavior, unhealthy-container detection, and transient Docker monitoring errors were exercised against isolated temporary containers and service rows, without stopping or changing the real demo container. A disabled seeded service retained its prior `RUNNING`/`HEALTHY` observation and created no incident while the target was unhealthy. Enabling it caused the worker to record `RUNNING`/`UNHEALTHY` and create one active `CONTAINER_UNHEALTHY` incident. A separate worker using a deliberately missing Docker socket logged `ENOENT` and left the seeded service status, health, and `lastCheckedAt` unchanged without creating an incident. All temporary containers, service rows, and generated incidents were removed afterward.
- After isolated verification cleanup, Compose database, backend, demo app, and frontend were healthy; the real demo service remained `RUNNING`/`HEALTHY`, and the active incident list was empty.
- A Compose stop/restart demonstration created exactly one active stopped-container incident across repeated polls, returned its detail from the API, then resolved it after restart. The API reported the service as `RUNNING`/`HEALTHY` afterward.
- The React + TypeScript + Vite dashboard is implemented in `frontend/`. It displays service summary counts, current service/container status and health, recent incidents, and selected incident details including evidence, diagnosis, and diagnosis history. Selected incident data refreshes every five seconds. A manual Run Diagnosis action reports loading/errors and refreshes the result/history. Recovery remains manual.
- Dashboard CORS is configured in the Express app using a comma-separated origin allowlist (`CORS_ORIGINS`); Compose supplies `FRONTEND_ORIGINS`, defaulting to localhost and 127.0.0.1 on port 5173. GET, POST, and OPTIONS are allowed by this middleware.
- A multi-stage frontend Dockerfile builds static assets and serves them with Nginx; the Compose frontend publishes port 5173 by default. The frontend has no Docker socket mount.
- Frontend `npm run build` succeeded, backend `npm run build` succeeded, and `docker compose config --quiet` succeeded during Phase 6 implementation. The user confirmed the dashboard is working in the browser against the running Compose services. A later read-only check found the demo service `RUNNING`/`HEALTHY` and its most recent stopped-container incident `RESOLVED`; database, backend, demo app, and frontend Compose services were healthy at that check.
- The backend Dockerfile uses `npm ci`. A clean no-cache backend image build succeeded on retry after one `ECONNRESET`; clean `npm ci` also succeeded on the host and in a fresh Node 22 container. The documented full Compose startup then succeeded, generated Prisma Client, reported no pending migrations, and left the existing PostgreSQL data intact.
- Project documentation is organized under `docs/` for architecture, configuration/local setup, API, operations/data model, and development/verification/security. The root README contains a short Compose quick start and links to those guides.
- Multi-container monitoring is configured in the root `.env` for five names (`self-healing-demo-app` through `self-healing-demo-app-5`). The running backend reports `Monitoring 5 configured container(s)`, and `GET /api/services` returns all five service records. At the latest check, apps 1–4 were healthy and app 5 was stopped with one active stopped-container incident; the frontend polls the API every five seconds.
- During Phase 0, the documented `docker compose up --build -d` startup briefly started the previously stopped `demo-app-5`. It was stopped again to restore its prior container state. The monitor resolved the prior active incident during the brief recovery and created a new active incident after the container was stopped again. No incident or service rows were deleted or manually rewritten.
- Thirty-two automated backend regression tests now run with Node's built-in test runner and the existing `tsx` dependency. They cover detection transitions, incident lifecycle, monitoring boundaries, evidence sanitization/scheduling, deterministic failure classification, diagnosis rules, persistence orchestration, and API service behavior including in-flight request deduplication. Tests use injected fake dependencies and do not connect to PostgreSQL or inspect Docker containers.
- The host Docker socket has group ID 129 on the development machine. Compose adds this group to the non-root backend container via `DOCKER_GID`; hosts with a different socket group must update that value in `.env`.
- Host PostgreSQL on port 5432 and Compose PostgreSQL on loopback port 5433 are separate databases. The Compose backend uses the Compose database. A stale `self-healing-demo` row exists in host PostgreSQL from local-worker verification; Prisma Studio started with the default `backend/.env` reads that host database unless `DATABASE_URL` is overridden to port 5433.

### Roadmap progress

- **Phase 1 — Repository inspection and planning:** Complete.
- **Phase 2 — Backend and database foundation:** Complete and verified against PostgreSQL.
- **Phase 3 — Demo application and Compose:** Complete. Backend, database, demo app, and frontend services are defined in Compose; demo stop/start is used for controlled incident demonstration.
- **Phase 4 — Monitoring and detection:** Implemented and exercised inside the running Compose backend. The no-cache Dockerfile build succeeded on retry after one transient npm registry `ECONNRESET`.
- **Phase 5 — Incident persistence and API:** Complete and verified with a Compose stop/restart demonstration and database-backed API reads.
- **Phase 6 — Frontend dashboard:** Complete. Frontend and backend builds and Compose configuration were verified, and the user confirmed the dashboard works in the browser.
- **Phase 7 — End-to-end testing and documentation:** Manual V1 runtime verification and user documentation are complete. The documented clean Compose startup was verified on 2026-11-07 after a transient npm `ECONNRESET` on the first build attempt. Eight automated V1 regression tests pass. The passing tests and manual scenarios are described above.
- **V2 Phase 0 — V1 stabilization:** Complete. Clean backend build verified, regression suite added and passing, and existing Compose/PostgreSQL data preserved.
- **V2-A Phase 1 — Evidence collection:** Complete and verified. Added bounded, sanitized Docker evidence collection, per-evidence failure recording, a Prisma evidence model and additive migration, and nonblocking monitor integration. The migration was applied to the Compose database without resetting existing data. Eleven backend tests pass. The clean backend image build and Compose health check passed; all six evidence types were confirmed persisted for the existing stopped `demo-app-5` incident. No demo container state was changed during verification.
- **V2-A Phase 2 — Failure classification:** Complete. Added a Zod-validated pure classifier for all six specified categories, with failed evidence excluded and unsupported scenarios classified as unknown. Unit tests cover explicit OOM evidence, exit code 137 ambiguity, health and startup failures, missing containers, and insufficient evidence. It is not yet wired into a diagnosis engine or API.
- **V2-A Phase 3 — Rule-based diagnosis:** Complete and verified. Added modular deterministic rules, Zod-validated diagnosis results, and an engine that retrieves incident evidence and persists each run as a diagnosis history record. Added the `Diagnosis` model and applied its additive migration without altering existing incidents/evidence. The clean backend image and runtime are healthy; a live diagnosis for the existing stopped `demo-app-5` incident was persisted as `APPLICATION_CRASH` with `MEDIUM` confidence. The demo container was not changed.
- **V2-A Phase 4 — Backend API:** Complete and verified. Added evidence, latest diagnosis, diagnosis trigger, and paginated/filterable diagnosis history endpoints. IDs and query parameters are validated; errors use centralized handling. Concurrent diagnosis requests for the same incident share one in-flight run within the single backend process. Live checks passed for valid reads, invalid ID (400), unknown incident (404), POST CORS preflight, and diagnosis trigger (201). Thirty-two backend tests pass. A live API-triggered diagnosis was persisted; existing demo container state remained unchanged.
- **V2-A Phase 5 — Frontend:** Implemented. The incident detail view presents container/health/exit/restart/log evidence, unavailable collection states and timestamps, latest diagnosis details, supporting/missing evidence, confidence, method, and history. The Run Diagnosis interaction handles loading/errors and refreshes evidence/diagnosis/history. The frontend production build passed and the rebuilt Compose frontend is healthy and serves the updated bundle. Browser-level interactive acceptance is pending.
- **V2-A Phase 6 — Integration testing:** Not complete. Requires browser-level verification of the incident detail and diagnosis flow alongside the existing end-to-end scenarios.
- **V2-B — LLM-assisted diagnosis:** Not started; must wait until V2-A acceptance criteria are met.

Do not assume any feature beyond the verified items above has been implemented.

### Immediate next steps

1. Complete V2-A Phase 6: verify the dashboard interactions in a browser and run the integrated failure/diagnosis scenarios.
2. Complete and verify all V2-A acceptance criteria before proposing V2-B LLM work.

### First end-to-end target

> Run a demo application in Docker, stop its container, detect the stopped state, create and persist an incident, and show that incident on the React dashboard. Restart the container manually and verify that the displayed service and incident statuses update consistently.

---

## 16. Terminology

Use these terms consistently:

- **Service:** An application component being monitored.
- **Monitored service:** A registered service that the monitoring worker checks.
- **Enabled service:** A service currently included in monitoring.
- **Container state:** Docker's observed state, such as running, exited, or created.
- **Health status:** The result of a configured Docker health check, when available.
- **Monitoring observation:** A status or health result collected by the monitoring worker.
- **Detection rule:** A deterministic condition used to identify a failure.
- **Incident:** A persisted record of a detected failure that requires attention.
- **Active incident:** An incident that has not yet been marked resolved.
- **Resolved incident:** An incident whose associated failure condition is no longer present, according to the defined lifecycle.
- **Monitoring error:** A failure to collect an observation; it is not automatically proof that the monitored service has failed.

---

**End of project context.**
