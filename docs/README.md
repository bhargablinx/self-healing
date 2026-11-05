# Documentation

This folder documents the implemented V1. The repository [context file](../context.md) remains the source for project goals, constraints, and phase status.

## Guides

- [Architecture](architecture.md): components, monitoring flow, detection, and incident lifecycle.
- [Configuration and local setup](configuration.md): Compose startup, ports, environment variables, and common startup problems.
- [API reference](api.md): endpoints, parameters, response shapes, and errors.
- [Operations and data model](operations.md): demo walkthrough, stored records, monitoring behavior, and limitations.
- [Development, verification, and security](development.md): code layout, development commands, manual verification, and security boundaries.

## V1 at a glance

The Compose application includes a React dashboard, an Express API and monitoring worker, PostgreSQL, and a small demo app. The worker inspects only container names listed in `MONITORED_CONTAINERS`. Detected stopped, unhealthy, or unavailable conditions are persisted as incidents and shown in the dashboard.

V1 is observational. Recovery is manual; the project has no AI diagnosis, restart action, shell command execution, authentication, or authorization.
