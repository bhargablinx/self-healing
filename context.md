# Project Context: Self-Healing Software

> **Purpose:** This file gives developers and AI coding agents the current project goals, V1 scope, architecture, technology choices, constraints, and development direction.
>
> **Project status:** Planning / early prototype stage. Do not assume that any feature is implemented until it has been verified in the repository.

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

- [ ] The project starts using documented Docker Compose commands.
- [ ] PostgreSQL is persistent across container restarts.
- [ ] The backend connects to PostgreSQL through Prisma.
- [ ] The demo application appears in the dashboard as healthy/running.
- [ ] Stopping the enabled demo container is detected.
- [ ] A corresponding incident is created and persisted.
- [ ] The dashboard displays the incident automatically through polling/refresh.
- [ ] Incident details show the correct service, type, status, and timestamps.
- [ ] Repeated checks do not create duplicate active incidents for the same ongoing failure.
- [ ] Disabled or intentionally unmanaged services are not reported as unexpected failures.
- [ ] Temporary monitoring errors are not immediately misclassified as confirmed container failures.
- [ ] Restarting the demo container updates its service status and the incident lifecycle consistently.
- [ ] The UI does not claim that automated recovery occurred.
- [ ] The README explains setup, configuration, demonstration steps, and known limitations.

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

### Verified implementation status (updated 2026-11-05)

- Repository inspection is complete. The project-specific README and this context file are present.
- Backend foundation is implemented in `backend/` using Express 5, TypeScript, Zod, and Prisma 7 with the PostgreSQL driver adapter.
- Prisma Client is generated from `backend/prisma/schema.prisma`. The `Service` and `Incident` models, enums, relation, and indexes are defined.
- The initial Prisma migration has been applied successfully to the Compose PostgreSQL database. A Prisma Client query from the backend container also succeeded.
- `GET /api/health` is implemented and has returned HTTP 200 from both a local backend process on port 3000 and the Compose backend on port 3001.
- A demo application exists in `demo-app/`, with `GET /` and `GET /health`.
- Docker Compose currently runs PostgreSQL, the backend, and demo app. PostgreSQL has a named persistent volume and health check; the backend and demo app have health checks. The frontend Compose service is not implemented yet.
- The Compose backend defaults to host port 3001 because port 3000 is already used by a local backend process on the development machine. Set `BACKEND_PORT` in the root `.env` to change it.
- No Docker socket is mounted into any container. When monitoring is implemented, socket access must be added only to the backend component that needs it.
- Monitoring/worker logic, incident creation and lifecycle handling, service/incident API endpoints, and the React dashboard are not implemented yet.

### Roadmap progress

- **Phase 1 — Repository inspection and planning:** Complete.
- **Phase 2 — Backend and database foundation:** Complete and verified against PostgreSQL.
- **Phase 3 — Demo application and Compose:** Partially complete. The backend, database, and demo app run in Compose; the frontend service remains to be integrated.
- **Phase 4 — Monitoring and detection:** Not started. This is the next implementation phase.
- **Phase 5 — Incident persistence and API:** Not started. The Prisma models exist, but incident lifecycle logic and service/incident API routes do not.
- **Phase 6 — Frontend dashboard:** Not started.
- **Phase 7 — End-to-end testing and documentation:** Not started. Only foundation and health checks have been verified so far.

Do not assume any feature beyond the verified items above has been implemented.

### Immediate next steps

1. Implement Phase 4 monitoring and detection: add Dockerode, configure an explicit set of monitored containers, collect container state/health, and add deterministic detection with disabled-service and transient-error handling.
2. Keep the worker independent from Express route handlers and do not add recovery actions or arbitrary command execution.
3. Continue to Phase 5 only after monitoring/detection is implemented and reviewed; persist incidents with deduplication and lifecycle updates, then expose service and incident API endpoints.
4. Integrate the frontend service into Compose when the React/Vite frontend is built in Phase 6.
5. Update this status block after each phase to reflect executed and verified work accurately.

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
