# V2 Implementation – Intelligent Incident Diagnosis

Act as a senior software engineer, backend architect, and AI integration engineer.

We are developing a college major project called:

**Self-Healing Software – AI-Based Autonomous System Recovery**

Your task is to extend our existing V1 application into V2, introducing intelligent incident diagnosis.

Before doing anything, carefully read the root `context.md` and `README.md`.

These files describe the project architecture, technology choices, V1 requirements, verified implementation status, and development constraints.

The existing V1 implementation is working. Your job is to extend it, not rebuild it.

---

# 1. Project Objective

Our current V1 system can:

1. Monitor registered Docker containers.
2. Detect container failures.
3. Create incidents automatically.
4. Persist incidents in PostgreSQL using Prisma.
5. Display service health and incidents on a React dashboard.
6. Prevent duplicate active incidents.
7. Resolve incidents when services return to a healthy state.

However, V1 primarily tells us WHAT failed.

For V2, we want the system to investigate incidents and identify WHY a failure might have occurred.

The new workflow should be:

**Failure Detection → Incident Creation → Evidence Collection → Diagnostic Engine → Probable Cause Identification → Dashboard Display**

We will implement diagnosis in two stages.

### V2-A: Rule-Based Diagnosis

Implement evidence collection, failure classification, and deterministic diagnosis using predefined rules.

### V2-B: LLM-Assisted Diagnosis

Integrate an LLM API to interpret collected evidence, explain probable causes, and provide investigation recommendations.

**Important:** Complete and test V2-A before starting V2-B.

---

# 2. Existing Technology Stack

Do not change the existing technology stack.

### Backend

- Node.js
- Express 5
- TypeScript
- Prisma ORM 7
- Zod

### Frontend

- React
- TypeScript
- Vite
- Tailwind CSS

### Database

- PostgreSQL

### Container Integration

- Docker Engine
- Docker SDK for Node.js (`dockerode`)

### Infrastructure

- Docker
- Docker Compose

Use the dependencies and configurations already present in the repository wherever possible.

Do not introduce Python, FastAPI, SQLAlchemy, Alembic, or another ORM.

Do not replace existing packages or upgrade major versions without explaining the reason first.

---

# 3. Important Development Rules

Before implementing anything:

1. Inspect the existing repository.
2. Read `context.md` and `README.md`.
3. Inspect the existing Prisma schema and migrations.
4. Understand how monitoring, detection, incident creation, and resolution currently work.
5. Identify existing modules that can be extended.
6. Check the current Git status.
7. Present an implementation plan before modifying files.

Never assume a feature is missing simply because it is not described in this prompt.

Do not rewrite working V1 modules unnecessarily.

Preserve all existing V1 functionality.

Work incrementally, with tests and verification after each major phase.

Explain architectural decisions in beginner-friendly language because this project is being developed by a student who wants to understand and explain the implementation during college evaluation.

---

# 4. First Task – Stabilize the Existing V1

Before adding V2 functionality, address the remaining V1 verification gaps documented in `context.md`.

The current running Compose stack works, but a clean backend image build using freshly installed dependencies has not been verified because dependency installation previously stalled.

Also, automated regression tests have not yet been added or executed.

### Tasks

1. Inspect the backend Dockerfile.
2. Inspect package.json and package-lock.json.
3. Investigate why clean dependency installation stalled.
4. Check Prisma generation and build steps.
5. Fix the build process if a reproducible solution is available.
6. Verify that the backend can be built from a clean image.
7. Add automated tests for:
    - Failure detection transitions.
    - Incident deduplication.
    - Incident resolution.
    - Disabled-service handling.
    - Temporary Docker monitoring errors.

Do not delete the existing database volume or user data.

If dependency installation remains blocked by environmental issues, document the exact cause and continue with isolated V2 development using the working environment. Do not claim a clean build was successful unless it was actually verified.

**Deliverable:** A stable V1 foundation with documented build status and automated regression tests.

---

# 5. V2-A – Diagnostic Evidence Collection

This is the first major V2 feature.

When an incident is created, the system should collect useful diagnostic evidence from the affected Docker container.

Use the existing Docker SDK integration (`dockerode`).

## 5.1 Evidence to collect

For every detected incident, attempt to collect:

### Container information

- Container ID.
- Container name.
- Container state.
- Container status.
- Container exit code.
- Docker error message, if available.
- OOMKilled flag.
- Restart count.
- Container start timestamp.
- Container finish timestamp.

### Health information

- Current health status.
- Health-check failure count.
- Recent health-check output, where available.

### Container logs

- Recent stdout logs.
- Recent stderr logs.
- A configurable, bounded log window.
- Log collection timestamp.

### Service information

- Service name.
- Previous known service status.
- Last successful monitoring timestamp.
- Incident detection timestamp.

Not every field will be available for every failure. Missing information must be represented clearly rather than fabricated.

## 5.2 Evidence collection rules

- Collect evidence as close to incident detection as possible.
- Avoid collecting unlimited container logs.
- Use configurable log limits.
- Handle containers that have already disappeared.
- Handle Docker API errors gracefully.
- Avoid blocking the monitoring worker indefinitely.
- Do not allow evidence collection failures to prevent incident creation.
- Store evidence collection errors separately from the actual failure evidence.
- Avoid storing secrets, tokens, passwords, or sensitive environment variables.
- Sanitize sensitive information from logs before exposing it to the frontend or sending it to an LLM.

**Important:** Evidence collection must be asynchronous or otherwise designed so that slow Docker log retrieval does not block the existing monitoring loop.

## 5.3 Evidence collector module

Create a dedicated module for evidence collection.

Suggested structure:

```text
backend/src/
├── monitoring/
├── detection/
├── incidents/
│
├── diagnosis/
│   ├── evidence-collector.ts
│   ├── evidence-service.ts
│   ├── diagnosis-engine.ts
│   ├── diagnosis-rules.ts
│   ├── failure-classifier.ts
│   └── diagnosis-types.ts
```

Adapt this structure to the existing repository.

Do not create unnecessary duplicate modules.

---

# 6. V2-A – Prisma Database Changes

Extend the existing Prisma schema without breaking existing V1 data or relationships.

Keep the current Service and Incident models.

Introduce two additional models.

## 6.1 IncidentEvidence

This model stores evidence collected for an incident.

Suggested fields:

- id
- incidentId
- evidenceType
- content (JSON)
- collectedAt
- collectionStatus
- collectionError (nullable)

Suggested evidence types:

- CONTAINER_STATE
- CONTAINER_LOGS
- EXIT_CODE
- HEALTH_CHECK
- RESTART_COUNT
- CONTAINER_METADATA

One incident can have multiple evidence records.

## 6.2 Diagnosis

This model stores the result of an investigation.

Suggested fields:

- id
- incidentId
- diagnosisType
- probableCause
- explanation
- confidence
- supportingEvidence (JSON)
- missingEvidence (JSON)
- diagnosisMethod
- createdAt

Suggested diagnosis methods:

- RULE_BASED
- LLM

Suggested confidence categories:

- LOW
- MEDIUM
- HIGH
- INCONCLUSIVE

One incident may have multiple diagnosis records.

For example, an initial rule-based diagnosis may later be supplemented by an LLM-assisted diagnosis.

### Database requirements

- Use Prisma relations.
- Add appropriate indexes.
- Use enums where suitable.
- Use JSON fields for flexible evidence structures.
- Preserve existing V1 records.
- Create proper Prisma migrations.
- Do not reset the database.
- Do not use raw SQL for normal application database operations.

Explain the migration before applying it.

---

# 7. V2-A – Failure Classification

Implement a failure classifier that categorizes observed failures.

Initially support these categories:

| Failure category      | Possible indicators                                 |
| --------------------- | --------------------------------------------------- |
| APPLICATION_CRASH     | Unexpected exit and application error logs          |
| OUT_OF_MEMORY         | Docker OOMKilled flag or supporting memory evidence |
| HEALTH_CHECK_FAILURE  | Docker health status unhealthy                      |
| STARTUP_FAILURE       | Startup errors and failed health checks             |
| CONTAINER_UNAVAILABLE | Configured container cannot be found                |
| UNKNOWN_FAILURE       | Insufficient diagnostic evidence                    |

These categories should be treated as classifications based on available evidence, not guaranteed root causes.

Important diagnostic considerations:

- Exit code 1 does not identify a specific root cause.
- Exit code 137 does not independently prove an OOM kill.
- An unhealthy health check does not necessarily mean the container process crashed.
- A missing container could have been intentionally removed.
- A temporary Docker API failure must not automatically become a container failure.

Use multiple evidence sources whenever possible.

---

# 8. V2-A – Rule-Based Diagnostic Engine

This is the central feature of V2-A.

Create a deterministic diagnostic engine that evaluates collected evidence using predefined rules.

The engine should:

1. Receive an incident ID.
2. Retrieve the incident and associated service.
3. Retrieve the available diagnostic evidence.
4. Evaluate applicable diagnostic rules.
5. Identify one or more probable causes.
6. Generate a human-readable explanation.
7. Identify supporting evidence.
8. Identify missing evidence.
9. Assign a confidence category.
10. Store the diagnosis using Prisma.

## 8.1 Initial diagnostic rules

Implement rules for these scenarios.

### Rule 1 – Application crash

Conditions:

- Container has exited.
- Exit code is non-zero.
- Application logs may contain error messages.

Result:

- Probable cause: Application process terminated unexpectedly.
- Confidence depends on supporting log evidence.

### Rule 2 – Possible out-of-memory termination

Conditions:

- Docker reports OOMKilled as true, or
- Exit code and available memory evidence suggest a possible OOM event.

Result:

- Probable cause: Possible memory exhaustion.
- Give higher confidence when the Docker OOMKilled flag confirms the event.

### Rule 3 – Health-check failure

Conditions:

- Container is running.
- Docker health status is unhealthy.
- Health-check logs indicate repeated failures.

Result:

- Probable cause: Application is running but failing its health checks.

### Rule 4 – Startup failure

Conditions:

- Container fails shortly after starting.
- Available logs contain startup-related errors.
- Health checks fail during startup.

Result:

- Probable cause: Application startup failure.

### Rule 5 – Container unavailable

Conditions:

- A previously registered container cannot be found.
- Docker confirms that the target does not exist.

Result:

- Probable cause: Container unavailable or removed.

Do not classify a transient Docker daemon connection error as a missing container.

### Rule 6 – Unknown failure

Conditions:

- Available evidence does not support a specific diagnosis.

Result:

- Probable cause: Insufficient evidence.
- Confidence: INCONCLUSIVE.
- Explanation should state what additional evidence would be useful.

## 8.2 Diagnostic engine design

Keep diagnostic rules independent and testable.

The diagnostic engine should not contain all rules in one large conditional statement.

Use a simple rule registry or modular rule functions.

Avoid machine learning and complex AI frameworks.

Do not add unnecessary abstraction.

## 8.3 Diagnosis output

Use a consistent internal structure similar to:

```json
{
    "diagnosisType": "APPLICATION_CRASH",
    "probableCause": "Application process terminated unexpectedly",
    "explanation": "The container exited with a non-zero exit code. Recent logs contain an application error.",
    "confidence": "MEDIUM",
    "supportingEvidence": [
        "Container exited with code 1",
        "Application error found in recent logs"
    ],
    "missingEvidence": ["Detailed application stack trace"],
    "diagnosisMethod": "RULE_BASED"
}
```

Use TypeScript types and Zod schemas to validate diagnostic results.

Do not invent evidence or report unsupported conclusions.

---

# 9. V2-A – Backend API

Preserve all existing V1 endpoints.

Add these endpoints:

### Evidence

GET `/api/incidents/:id/evidence`

Returns the diagnostic evidence associated with an incident.

### Diagnosis

GET `/api/incidents/:id/diagnosis`

Returns the latest diagnosis for an incident.

POST `/api/incidents/:id/diagnose`

Triggers a new rule-based diagnostic investigation or returns an appropriate result if one is already running.

### Diagnosis history

GET `/api/diagnoses`

Returns diagnosis history with appropriate pagination and optional filtering.

### API requirements

- Use existing Express routing conventions.
- Validate IDs and query parameters with Zod.
- Use consistent JSON response structures.
- Implement appropriate HTTP status codes.
- Use centralized error handling.
- Prevent duplicate concurrent diagnostic jobs for the same incident.
- Do not expose stack traces or internal errors.
- Keep controllers thin.
- Keep diagnosis logic in its own service layer.

The diagnosis endpoint must not create unnecessary duplicate records every time the user refreshes the page.

---

# 10. V2-A – Frontend Dashboard Improvements

Extend the existing React dashboard.

Do not redesign the entire dashboard or remove working V1 features.

Add diagnostic information to the existing incident details view.

## 10.1 Incident evidence section

Display:

- Container name and ID.
- Container state.
- Exit code.
- OOMKilled status.
- Restart count.
- Health-check status.
- Recent container logs.
- Evidence collection timestamps.

Handle unavailable evidence clearly.

## 10.2 Diagnosis section

Display:

- Failure category.
- Probable cause.
- Explanation.
- Confidence category.
- Supporting evidence.
- Missing evidence.
- Diagnosis method.
- Diagnosis timestamp.

## 10.3 User interactions

Add a button such as:

**Run Diagnosis**

When clicked:

1. Call the diagnosis API.
2. Show a loading state.
3. Display the diagnosis when completed.
4. Show an error if diagnosis fails.
5. Refresh the diagnosis history.

Avoid repeated requests while a diagnosis is already running.

## 10.4 Design requirements

Maintain the existing visual direction:

- White background.
- Dark text.
- Subtle borders.
- Simple status indicators.
- Clean information hierarchy.
- Responsive layout.

Do not introduce unnecessary animations.

All evidence and diagnosis displayed must come from actual backend data, not hardcoded mock values.

---

# 11. V2-A – Testing and Verification

Add automated tests.

Prioritize:

### Evidence collection tests

- Collect evidence from a running container.
- Collect evidence from an exited container.
- Handle a missing container.
- Handle Docker API errors.
- Handle unavailable logs.
- Verify log size limits and sanitization.

### Failure classification tests

- Application crash.
- Possible OOM termination.
- Health-check failure.
- Startup failure.
- Container unavailable.
- Unknown failure.

### Diagnostic engine tests

- Correct rules are selected.
- Supporting evidence is included.
- Missing evidence is identified.
- Confidence categories are assigned consistently.
- Unknown failures do not receive fabricated diagnoses.

### Integration tests

- Incident creation triggers evidence collection.
- Evidence is stored in PostgreSQL.
- Rule-based diagnosis is persisted.
- API returns actual evidence and diagnosis.
- Dashboard displays the results.
- Existing V1 monitoring and incident functionality remains intact.

Use the testing tools already present in the repository where practical.

Use isolated temporary Docker containers for integration tests.

Never stop or modify the actual demo containers without explicit approval.

---

# 12. V2-A Acceptance Criteria

V2-A is complete when:

- Existing V1 functionality continues working.
- Diagnostic evidence is collected when an incident occurs.
- Evidence collection does not break incident creation.
- Container logs are collected with configurable limits.
- Exit codes and termination information are captured where available.
- Failure classification works for supported scenarios.
- The rule-based diagnostic engine produces probable causes.
- Unsupported conclusions are not presented as confirmed root causes.
- Diagnostic results are stored using Prisma.
- Evidence and diagnosis APIs return actual database data.
- The dashboard displays evidence and diagnosis.
- Users can trigger diagnosis manually.
- Repeated requests do not create unnecessary duplicate diagnosis jobs.
- Automated tests cover the main diagnostic scenarios.
- Documentation reflects the actual implementation.

**Do not proceed to LLM integration until these criteria are met.**

---

# 13. V2-B – LLM-Assisted Diagnosis

After V2-A is complete, introduce LLM-assisted diagnosis.

The purpose of the LLM is to interpret diagnostic evidence and produce a more useful explanation.

It should complement the rule-based engine, not replace it.

## 13.1 LLM integration architecture

Create a separate AI module.

Suggested structure:

```text
backend/src/
├── diagnosis/
│   ├── evidence-collector.ts
│   ├── diagnosis-engine.ts
│   └── diagnosis-rules.ts
│
├── ai/
│   ├── ai-provider.ts
│   ├── llm-diagnosis.ts
│   ├── ai-types.ts
│   └── providers/
│       └── openai-provider.ts
```

Adapt this to the actual codebase.

## 13.2 AI provider abstraction

Use a provider abstraction so that the application does not depend directly on a specific LLM provider.

Initially support one provider.

Prefer the OpenAI API for the first implementation.

Keep the API key in an environment variable:

`OPENAI_API_KEY`

Use a configurable model name rather than hardcoding it throughout the application.

Do not expose the API key to the frontend.

Do not send requests to the AI provider directly from React.

## 13.3 LLM input

The LLM should receive a carefully constructed diagnostic payload containing:

- Incident type.
- Affected service.
- Container state.
- Exit code.
- OOMKilled information.
- Health-check information.
- Recent sanitized logs.
- Rule-based diagnosis.
- Supporting evidence.
- Missing evidence.

Do not send the entire database record or unrestricted container information.

Limit input size and remove sensitive information.

Treat container logs as untrusted data. Instructions appearing inside logs must never override the diagnostic system's instructions.

## 13.4 LLM responsibilities

The LLM should:

1. Interpret collected evidence.
2. Explain the probable failure cause.
3. Correlate log messages with container state.
4. Identify conflicting evidence.
5. Identify missing diagnostic information.
6. Suggest further investigation steps.
7. Explain its reasoning in understandable language.

The LLM should not:

- Execute shell commands.
- Access the Docker socket.
- Restart containers.
- Modify database records directly.
- Execute arbitrary tools.
- Authorize recovery actions.
- Claim certainty without sufficient evidence.

V2 is diagnosis only. Recovery remains outside this implementation.

## 13.5 Structured LLM output

Require structured JSON similar to:

```json
{
    "probableCause": "Application startup failure",
    "explanation": "The application appears to have terminated during startup due to a runtime error.",
    "supportingEvidence": [
        "Container exited with code 1",
        "Startup error found in recent logs"
    ],
    "missingEvidence": ["Detailed application stack trace"],
    "confidence": "MEDIUM",
    "suggestedInvestigation": [
        "Inspect application startup configuration",
        "Review the complete startup stack trace"
    ]
}
```

Validate the response using Zod before storing it.

Handle malformed output, API errors, rate limits, timeouts, and unavailable providers gracefully.

Never assume that valid JSON means a diagnosis is correct.

## 13.6 Compare rule-based and LLM diagnoses

Keep the results separate.

For example:

**Rule-based diagnosis**

- Probable cause: Application crash.
- Confidence: Medium.
- Method: RULE_BASED.

**LLM-assisted diagnosis**

- Probable cause: Configuration error during startup.
- Confidence: Medium.
- Method: LLM.

The dashboard should clearly identify which method generated each diagnosis.

Do not silently overwrite rule-based results with LLM output.

If the LLM is unavailable, the rule-based diagnosis must remain accessible.

---

# 14. V2-B Acceptance Criteria

LLM integration is complete when:

- An LLM provider is integrated into the backend.
- The API key remains server-side.
- Only relevant sanitized diagnostic evidence is sent.
- Structured output is validated using Zod.
- LLM results are persisted using Prisma.
- LLM diagnosis is distinguishable from rule-based diagnosis.
- The dashboard displays both diagnosis methods.
- Provider failures do not break V1 or V2-A.
- No Docker or shell execution is exposed to the LLM.
- The system clearly communicates uncertainty and missing evidence.

---

# 15. Evaluation and Academic Testing

This is a college major project, so we need measurable results.

Create repeatable failure scenarios using isolated demo containers.

Suggested experiments:

| Experiment                       | Expected diagnostic result |
| -------------------------------- | -------------------------- |
| Application exits with code 1    | Application crash          |
| Container is OOM-killed          | Memory-related failure     |
| Health endpoint fails            | Health-check failure       |
| Application fails during startup | Startup failure            |
| Container is removed             | Container unavailable      |
| Insufficient evidence            | Unknown/inconclusive       |

Record actual observations.

Compare rule-based diagnosis with LLM-assisted diagnosis.

Evaluate:

1. Correct failure classification.
2. Accuracy of probable causes against known test scenarios.
3. Unsupported or incorrect explanations.
4. Missing evidence identification.
5. Diagnosis response time.
6. LLM API cost, if available.
7. Cases where the system correctly reports insufficient evidence.

Use actual experiment results. Do not invent accuracy percentages or performance numbers.

Keep the evaluation methodology and results documented in `docs/`.

---

# 16. Development Phases and Execution Order

Follow this order strictly.

### Phase 0 – V1 stabilization

- Investigate clean Docker build.
- Add automated regression tests.
- Verify existing V1 functionality.

### Phase 1 – Evidence collection

- Implement evidence collector.
- Capture container metadata and logs.
- Persist incident evidence.

### Phase 2 – Failure classification

- Implement deterministic failure categories.
- Add unit tests.

### Phase 3 – Rule-based diagnosis

- Implement diagnostic rules.
- Implement diagnosis engine.
- Store diagnosis records.

### Phase 4 – Backend API

- Add evidence and diagnosis endpoints.
- Test API behaviour.

### Phase 5 – Frontend

- Add incident evidence section.
- Add diagnosis section.
- Add Run Diagnosis interaction.

### Phase 6 – V2-A integration testing

- Run all failure scenarios.
- Verify persistence.
- Verify dashboard integration.
- Verify that V1 remains functional.

### Phase 7 – LLM integration

- Add provider abstraction.
- Integrate OpenAI API.
- Implement structured output validation.
- Persist LLM diagnosis separately.

### Phase 8 – Evaluation and documentation

- Compare rule-based and LLM diagnosis.
- Record experiment results.
- Update project documentation.

Do not jump directly to Phase 7.

---

# 17. Documentation Requirements

Update the existing documentation instead of creating unnecessary duplicate documents.

Update:

- `context.md`
- `README.md`
- `docs/architecture.md`
- `docs/configuration.md`
- `docs/api.md`
- `docs/operations.md`
- `docs/development.md`

Document:

- New architecture.
- Evidence collection flow.
- Diagnostic engine.
- Failure classification rules.
- Database schema changes.
- API endpoints.
- LLM provider configuration.
- Environment variables.
- Testing instructions.
- Known limitations.

Update the V1 status section in `context.md` without removing its verified history.

Add separate V2-A and V2-B progress sections.

Clearly distinguish implemented features from planned features.

---

# 18. Important Restrictions

These restrictions apply throughout V2.

1. Do not rewrite the working V1 architecture.
2. Do not replace Node.js, Express, TypeScript, Prisma, or PostgreSQL.
3. Do not introduce Python or another ORM.
4. Do not add autonomous agents or agent frameworks.
5. Do not implement automatic recovery.
6. Do not expose arbitrary Docker operations through the API.
7. Do not allow the LLM to execute commands.
8. Do not expose the Docker socket to the frontend or AI provider.
9. Do not store unbounded container logs.
10. Do not expose secrets contained in logs.
11. Do not fabricate diagnostic evidence.
12. Do not claim that a probable cause is a confirmed root cause without supporting proof.
13. Do not break existing incident deduplication or resolution behaviour.
14. Do not delete existing database records or reset the database.
15. Do not claim tests pass unless they have actually been executed.

---

# 19. How I Want You to Work

I am a student with full-stack development experience. I am still learning distributed systems, diagnostic systems, and AI integration.

Act as both an engineer and a technical mentor.

For every major implementation phase:

1. Explain what we are building.
2. Explain why it is needed.
3. Explain the architecture and data flow.
4. Identify which existing files will change.
5. Implement the smallest useful increment.
6. Run appropriate tests.
7. Explain the actual test results.
8. Document any limitations.

Avoid generating hundreds of lines of code without explaining the architecture.

Do not create unnecessary abstractions.

Use clean, modular TypeScript.

Keep functions small and testable.

Use proper error handling.

Prefer deterministic and reproducible behaviour.

At the end of every phase, provide:

- What was implemented.
- Files created or modified.
- Database migrations applied.
- Dependencies added, if any.
- Commands executed.
- Tests executed and their actual results.
- Known issues.
- Next phase.

**Wait for my confirmation before starting the next major phase.**

---

# 20. First Action – Start Here

Do not immediately begin coding the entire V2 system.

Start with the following:

1. Read `context.md`.
2. Read `README.md`.
3. Inspect the existing backend and frontend.
4. Inspect the current Prisma schema and migration history.
5. Inspect monitoring, detection, and incident creation modules.
6. Inspect the current Docker Compose environment.
7. Review the V1 verification gaps.
8. Check the Git working tree.

Then provide:

- A summary of the existing architecture.
- What is already implemented.
- What needs to be extended.
- Any technical risks.
- A repository-specific V2 implementation plan.

Begin with **Phase 0 – V1 Stabilization**.

Do not implement evidence collection or diagnosis until the initial inspection and plan are complete.

**Our ultimate V2 goal: When a monitored container fails, the system should automatically collect diagnostic evidence, identify a probable cause using deterministic rules, and display a useful explanation in the dashboard. Later, an LLM should improve the explanation using the same evidence without gaining control over the infrastructure.**
s
