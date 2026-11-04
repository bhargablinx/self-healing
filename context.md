# Project Context: Self-Healing Software

> **Purpose of this file:** Give any AI coding agent, developer, or
> collaborator a concise but sufficiently detailed understanding of the
> project's goals, scope, architecture, constraints, and current
> development direction.
>
> **Project status:** Idea / planning stage moving toward a basic V1
> prototype. Do not assume that features described below have already
> been implemented.

------------------------------------------------------------------------

## 1. Project Identity

**Project title:** Self-Healing Software -- AI-Based Autonomous System
Recovery

**Repository name:** `self-healing-software`

**Project type:** College major project / academic software engineering
project

**Short description:**

An AI-assisted platform for monitoring containerized distributed
applications, detecting failures and abnormal behaviour, identifying
probable root causes, recommending or executing controlled recovery
actions, and verifying whether recovery was successful.

**Core idea:**

Move from software that only detects and reports failures to software
that can investigate incidents, take permitted recovery actions, and
verify the result.

**One-line pitch:**

> An AI-assisted self-healing platform that detects, diagnoses, and
> recovers from selected failures in distributed applications through
> safe, verified automation.

------------------------------------------------------------------------

## 2. Problem Being Addressed

Modern distributed applications are composed of multiple services and
infrastructure components. A failure in one component can affect
dependent services and cause errors, increased latency, or application
unavailability.

Common failure scenarios include:

-   A service or container crashes.
-   CPU utilization becomes unusually high.
-   Memory usage grows excessively.
-   A database becomes unavailable or connections are exhausted.
-   Redis or another cache service becomes unavailable.
-   Request latency or error rates increase.
-   A failure in one service affects dependent services.

Traditional monitoring systems can collect metrics, logs, traces, and
alerts, but investigation and recovery often still require human
intervention.

The project aims to reduce this manual effort by implementing a
controlled workflow:

**Observe → Detect → Diagnose → Plan → Validate → Recover → Verify**

If recovery fails, the platform should record the failure and, where
safe and supported, roll back or attempt another permitted action.

------------------------------------------------------------------------

## 3. V1 Product Scope

The first version must be achievable by a student team and should
demonstrate a complete end-to-end self-healing workflow. Prioritize a
small, reliable prototype over a large collection of unfinished
features.

### V1 must-have capabilities

1.  Monitor a small set of Docker containers.
2.  Collect container status and basic resource metrics such as CPU and
    memory.
3.  Check application health endpoints where available.
4.  Detect selected failures using explicit rules and thresholds.
5.  Create and persist incidents.
6.  Collect useful diagnostic evidence, including container state and
    recent logs.
7.  Identify probable causes using deterministic rules first.
8.  Optionally use an LLM to explain incident evidence and recommend an
    allowed recovery action.
9.  Validate proposed actions against a predefined safety policy.
10. Execute a limited recovery action, initially restarting an approved
    container.
11. Verify the service after the recovery action.
12. Record the recovery attempt, result, and timestamps.
13. Display services, incidents, and recovery history in a web
    dashboard.

### Initial failure scenarios

Start with these scenarios, in this order:

-   Container stopped or exited.
-   Application health endpoint returns unhealthy.
-   High CPU utilization.
-   High memory utilization.

Later, if time permits:

-   Database connection failure.
-   Redis unavailable.
-   Increased request latency.
-   Dependency-related or cascading failures.

### Initial recovery actions

Keep the first allowlist small:

-   Restart an approved container.

Potential later actions:

-   Clear a specific application cache.
-   Scale a service where the deployment environment supports it.
-   Disable an unhealthy instance.
-   Roll back a deployment when deployment versioning is implemented.

Do not claim that every failure can be automatically repaired. The
system should report when no safe or supported action is available.

------------------------------------------------------------------------

## 4. Explicitly Out of Scope for Initial V1

Do not build these before the basic end-to-end workflow works:

-   Full Kubernetes operator or Kubernetes orchestration.
-   Training a large language model.
-   Reinforcement learning for recovery decisions.
-   Arbitrary AI-generated shell commands.
-   Unrestricted AI access to Docker or the host.
-   A large microservice environment.
-   A custom monitoring or tracing platform.
-   Complex multi-agent orchestration.
-   Advanced ML anomaly detection before reliable baseline monitoring
    exists.

These may be considered future extensions, not V1 requirements.

------------------------------------------------------------------------

## 5. Proposed Technology Stack

Use the following stack unless a practical technical reason requires a
change.

  -----------------------------------------------------------------------
  Layer                   Preferred technology    Purpose
  ----------------------- ----------------------- -----------------------
  Main backend language   Python                  Monitoring, analysis,
                                                  automation, AI
                                                  integration

  Backend framework       FastAPI                 REST API

  Frontend                React + TypeScript      Web dashboard

  Frontend tooling        Vite                    Development and build
                                                  tooling

  Styling                 Tailwind CSS            UI styling

  Database                PostgreSQL              Services, incidents,
                                                  policies, recovery
                                                  history

  ORM                     SQLAlchemy              Database access

  Migrations              Alembic                 Database schema changes

  Container runtime       Docker Engine           Run target application
                                                  containers

  Container integration   Docker SDK for Python   Inspect and manage
                                                  approved containers

  Local orchestration     Docker Compose          Run the development
                                                  environment

  Metrics                 Prometheus              Time-series monitoring

  Metrics visualization   Grafana (optional in    Operational dashboards
                          V1)                     

  Logs                    Docker logs initially;  Diagnostic evidence
                          Loki later if useful    

  Distributed tracing     OpenTelemetry / Tempo   Cross-service request
                          later                   tracing

  AI                      OpenAI API or Ollama    Incident explanation
                                                  and recommendations

  Testing                 Pytest                  Backend and integration
                                                  tests

  Version control         Git + GitHub            Source control and
                                                  collaboration
  -----------------------------------------------------------------------

### AI integration approach

Start with a direct API integration rather than an agent framework.

-   Put LLM access behind a small provider abstraction.
-   Keep provider credentials in environment variables.
-   Support an OpenAI-compatible provider and/or Ollama if practical.
-   Ask the model for structured output validated by a Pydantic schema.
-   Treat model output as an untrusted recommendation.
-   Never let the model execute commands or call Docker directly.
-   If the AI provider is unavailable, deterministic detection and
    recovery logic should still work.

Do not make an LLM necessary for basic container-crash detection or
restart. The system should be useful even when AI is disabled.

------------------------------------------------------------------------

## 6. High-Level Architecture

``` text
                 TARGET APPLICATION
          +-----------+-----------+-----------+
          |           |           |           |
       Auth API    Orders API  Payment API  Dependencies
          |           |           |        (DB / Redis)
          +-----------+-----------+-----------+
                              |
                              v
                    DOCKER ENGINE
                              |
                    Container telemetry
                              |
                              v
                    MONITORING WORKER
                              |
                 +------------+------------+
                 |                         |
                 v                         v
          STATUS / HEALTH             RESOURCE METRICS
                 |                         |
                 +------------+------------+
                              |
                              v
                      DETECTION ENGINE
                              |
                              v
                       INCIDENT STORE
                              |
                              v
                     DIAGNOSIS ENGINE
                       |          |
                       |          v
                       |       LLM API
                       |          |
                       +-----+----+
                             |
                             v
                      RECOVERY PLANNER
                             |
                             v
                       SAFETY POLICY
                             |
                             v
                     RECOVERY EXECUTOR
                             |
                             v
                        VERIFICATION
                         /        \
                    Recovered    Failed
                       |           |
                       v           v
                  Resolve      Record failure /
                  incident     safe rollback or
                               manual intervention

             FASTAPI REST API <----> POSTGRESQL
                     |
                     v
              REACT DASHBOARD
```

### Main backend responsibilities

-   **Monitoring worker:** Periodically inspects registered containers
    and gathers health/resource information.
-   **Detection engine:** Evaluates rules, handles persistence windows,
    and avoids duplicate incidents.
-   **Incident manager:** Creates, updates, and resolves incidents.
-   **Diagnosis engine:** Uses deterministic checks and diagnostic
    evidence to identify probable causes.
-   **AI reasoner:** Explains evidence and suggests a structured,
    allowlisted action.
-   **Recovery planner:** Selects a supported action based on diagnosis
    and policy.
-   **Safety policy:** Checks whether the action is permitted, whether
    the target is managed, and whether limits/cooldowns are satisfied.
-   **Recovery executor:** Performs only explicitly implemented actions
    through the Docker SDK.
-   **Verifier:** Checks health after recovery and records the outcome.
-   **API:** Exposes data and operations to the frontend.
-   **Dashboard:** Displays system state and incident/recovery
    information.

------------------------------------------------------------------------

## 7. Important Safety and Reliability Rules

These rules are architectural requirements, not optional enhancements.

1.  **No arbitrary command execution.** Never execute shell commands
    generated by an LLM.
2.  **No direct AI infrastructure access.** The AI only returns
    structured analysis and recommendations.
3.  **Allowlist targets.** Only containers explicitly
    registered/configured as managed targets may be acted upon.
4.  **Allowlist actions.** Only implemented and policy-approved recovery
    actions may run.
5.  **Human approval first.** Start V1 in assisted mode: the system
    recommends an action and a human approves it. Autonomous mode may
    later be enabled for selected low-risk actions.
6.  **Isolate the environment.** Test against disposable local
    containers, not production infrastructure.
7.  **Protect Docker access.** Docker socket access is highly
    privileged. Keep it confined to the recovery/monitoring component,
    restrict managed targets, and document the risk. Do not expose the
    Docker socket to the frontend or LLM.
8.  **Limit retries.** Use retry limits and cooldown periods to avoid
    restart loops.
9.  **Prevent duplicate incidents.** Deduplicate repeated observations
    of the same active failure.
10. **Verify outcomes.** A successful API call to Docker does not mean
    the application recovered.
11. **Audit operations.** Record who/what initiated an action, the
    target, reason, timestamp, result, and verification outcome.
12. **Fail safely.** If diagnosis is uncertain or no safe action exists,
    request human intervention rather than guessing.
13. **Do not overstate confidence.** An LLM-generated confidence value
    is not automatically a calibrated probability. Treat it as a model
    estimate unless calibrated against data.

------------------------------------------------------------------------

## 8. Initial Data Model

The initial relational model is expected to include these entities:

### `services`

Possible fields:

-   `id`
-   `name`
-   `container_id` or configured container identifier
-   `health_endpoint` (nullable)
-   `status`
-   `is_managed`
-   `created_at`
-   `updated_at`

### `incidents`

Possible fields:

-   `id`
-   `service_id`
-   `incident_type`
-   `severity`
-   `description`
-   `root_cause`
-   `diagnostic_evidence` (JSON)
-   `status`
-   `detected_at`
-   `resolved_at`

### `recovery_actions`

Catalog of supported actions and their configuration:

-   `id`
-   `name`
-   `description`
-   `risk_level`
-   `is_enabled`

### `recovery_attempts`

-   `id`
-   `incident_id`
-   `action_id` or action name
-   `target_service_id`
-   `status`
-   `started_at`
-   `completed_at`
-   `verification_result`
-   `error_message`

### `audit_logs`

-   `id`
-   `event_type`
-   `actor` (system, user, or component)
-   `target`
-   `details` (JSON)
-   `created_at`

Use PostgreSQL for application records and incident history. Use
Prometheus for time-series metrics rather than storing every metric
sample in PostgreSQL.

------------------------------------------------------------------------

## 9. Suggested Repository Structure

The structure can evolve as implementation proceeds. Do not create empty
modules solely to match this tree.

``` text
self-healing-software/
├── backend/
│   ├── app/
│   │   ├── api/
│   │   ├── core/
│   │   ├── models/
│   │   ├── schemas/
│   │   ├── monitoring/
│   │   ├── detection/
│   │   ├── diagnosis/
│   │   ├── recovery/
│   │   ├── safety/
│   │   └── main.py
│   ├── tests/
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── hooks/
│   │   ├── services/
│   │   └── types/
│   └── Dockerfile
├── demo-services/
│   ├── auth-service/
│   ├── orders-service/
│   └── payment-service/
├── infrastructure/
│   ├── prometheus/
│   └── grafana/
├── docs/
│   ├── architecture.md
│   └── development-plan.md
├── docker-compose.yml
├── .env.example
├── .gitignore
├── README.md
└── context.md
```

------------------------------------------------------------------------

## 10. Development Roadmap

Suggested sequence; dates can be adjusted to the college schedule and
team size.

### Milestone 1 --- Foundation

-   Create the GitHub repository.
-   Set up FastAPI.
-   Set up React + TypeScript + Vite.
-   Configure PostgreSQL.
-   Create Docker Compose configuration.
-   Build one simple demo service with a `/health` endpoint.

**Deliverable:** Frontend and backend run locally; demo service runs in
Docker.

### Milestone 2 --- Container Monitoring

-   Connect the backend to Docker Engine using the Docker SDK.
-   Register known demo containers.
-   Collect container status, CPU, memory, and restart information.
-   Expose service information through the API.

**Deliverable:** API can show the current state of demo containers.

### Milestone 3 --- Detection and Incidents

-   Implement threshold/status checks.
-   Add monitoring loop.
-   Create incidents when conditions persist.
-   Add incident deduplication and cooldown handling.
-   Persist incidents in PostgreSQL.

**Deliverable:** Stopping a demo container produces one tracked
incident.

### Milestone 4 --- Safe Recovery and Verification

-   Implement restart for allowlisted containers.
-   Add assisted approval flow.
-   Add retry limits and audit logging.
-   Verify container and application health after restart.
-   Record success/failure.

**Deliverable:** An approved restart can recover a stopped demo service
and the result is recorded.

### Milestone 5 --- AI-Assisted Diagnosis

-   Add an LLM provider abstraction.
-   Send structured incident evidence to the model.
-   Validate structured output with Pydantic.
-   Display explanation and recommendation.
-   Keep AI recommendations separate from execution authorization.

**Deliverable:** Incident details include an AI-assisted explanation and
a safe recommendation.

### Milestone 6 --- Dashboard

-   Show overall service status.
-   Show active and historical incidents.
-   Show incident evidence and AI analysis.
-   Show recovery attempts and outcomes.
-   Add manual approval controls.

**Deliverable:** A usable end-to-end control dashboard.

### Milestone 7 --- Testing and Evaluation

-   Test service crash, unhealthy endpoint, CPU and memory scenarios.
-   Test invalid and disallowed recommendations.
-   Test Docker/API failures and recovery timeouts.
-   Measure detection and recovery performance.
-   Document limitations and results.

**Deliverable:** Repeatable demonstration scenarios, test results, and
project documentation.

------------------------------------------------------------------------

## 11. Evaluation Metrics

The project should be evaluated using real experiments rather than
invented results.

Track:

-   **Detection accuracy:** Precision, recall, and F1 where labelled
    test scenarios are available.
-   **False positive rate:** How often normal behaviour is incorrectly
    reported as an incident.
-   **MTTD (Mean Time to Detect):** Time from injected failure to
    incident detection.
-   **MTTR (Mean Time to Recovery):** Time from failure to verified
    recovery. Clearly define the measurement boundaries in the report.
-   **Recovery success rate:** Successful verified recoveries divided by
    recovery attempts.
-   **Manual intervention rate:** Incidents that require human action.
-   **Safety violations:** Disallowed actions blocked by the policy
    layer.

Compare manual recovery and automated/assisted recovery under repeatable
test conditions. Do not put example numbers in the report as if they
were measured results.

------------------------------------------------------------------------

## 12. Dashboard Pages

The planned dashboard should remain simple and functional.

1.  **Overview:** Overall health, service count, active incidents,
    recent recovery activity.
2.  **Services:** Registered containers, current state, health, CPU and
    memory.
3.  **Incidents:** Active and resolved incidents with severity and
    timestamps.
4.  **Incident details:** Evidence, logs, diagnosis, AI explanation,
    recommended action.
5.  **Recovery history:** Attempts, approvals, execution status,
    verification result.
6.  **Settings:** Thresholds, managed services, recovery policies, AI
    provider configuration.

A clean, light interface with a white background, dark text, clear
status indicators, and readable charts is a suitable initial visual
direction. Prioritize usability over decorative design.

------------------------------------------------------------------------

## 13. Working Principles for AI Coding Agents

Any AI agent contributing to this repository should follow these
instructions:

-   Read this `context.md` and the current `README.md` before making
    changes.
-   Inspect the existing repository before proposing or creating files.
-   Treat the actual codebase as the source of truth for implementation
    status. This document describes intended direction, not proof that
    features exist.
-   Do not rewrite the entire project or replace established choices
    without explaining why.
-   Work in small, testable increments.
-   Explain the purpose of files, modules, dependencies, and
    architectural decisions.
-   Prefer simple, maintainable Python and TypeScript.
-   Use type hints and Pydantic schemas in the backend.
-   Validate all external input and all LLM output.
-   Keep secrets in environment variables; never commit `.env` or API
    keys.
-   Update `.env.example` when adding configuration variables, using
    placeholders only.
-   Add tests for detection, policy validation, recovery, and
    verification logic.
-   Do not claim tests pass unless they were actually run.
-   Do not invent metrics, research results, implementation status, or
    citations.
-   Do not add a large dependency or agent framework unless there is a
    clear need.
-   Do not implement arbitrary shell execution or unrestricted
    infrastructure access.
-   Keep documentation aligned with actual implementation.
-   Before completing a task, summarize files changed, commands run,
    test results, and known limitations.

### Preferred implementation style

-   Backend: modular FastAPI application.
-   Database: SQLAlchemy models and Alembic migrations.
-   API contracts: Pydantic request/response schemas.
-   Frontend: React components with TypeScript types.
-   Configuration: environment-based settings.
-   Tests: Pytest for backend logic and integration tests where
    practical.
-   Recovery: explicit action registry and policy checks; never dispatch
    arbitrary model-generated commands.

------------------------------------------------------------------------

## 14. Current Project Status and Immediate Next Steps

**Current status:** The project has been discussed and planned. The
intended V1 scope, proposed stack, architecture, safety principles, and
development milestones have been outlined. Do not assume the repository
or any of these modules already exist.

### Immediate next steps

1.  Inspect the GitHub repository `self-healing-software` and determine
    what has actually been created.
2.  Create or refine the root `README.md`.
3.  Set up the initial backend with FastAPI.
4.  Set up the frontend with React, TypeScript, and Vite.
5.  Add PostgreSQL and a simple demo service to Docker Compose.
6.  Implement a demo service health endpoint.
7.  Establish a working local development workflow before adding
    monitoring or AI.

**First end-to-end target:**

> Run a demo service in Docker, stop that container, detect the stopped
> state, create an incident, recommend a restart, obtain approval,
> restart the container, verify its health, and mark the incident as
> recovered.

Once this works reliably, expand to resource anomalies and AI-assisted
diagnosis.

------------------------------------------------------------------------

## 15. Terminology

Use these terms consistently in code and documentation:

-   **Service:** An application component being monitored.
-   **Managed service:** A service explicitly registered and permitted
    for monitoring/recovery.
-   **Telemetry:** Metrics, logs, traces, and health information.
-   **Anomaly:** An observation that violates a rule or differs from
    expected behaviour.
-   **Incident:** A tracked occurrence that requires investigation or
    action.
-   **Root cause:** The probable underlying reason for an incident,
    supported by evidence.
-   **Recommendation:** A proposed response; not permission to execute
    it.
-   **Recovery action:** A predefined operation that the executor can
    perform.
-   **Verification:** Checks performed after an action to establish
    whether recovery succeeded.
-   **Rollback/replanning:** A safe response when a recovery attempt
    fails.

------------------------------------------------------------------------

**End of project context.**
