# API reference

The Compose API base URL is `http://localhost:3001` by default. Change `BACKEND_PORT` in the root `.env` to use another host port. Successful endpoints return JSON with a top-level `data` property. Timestamps are ISO 8601 UTC strings.

## Health

### `GET /api/health`

Returns API process health: `{"data":{"status":"ok"}}`. It does not check database or Docker availability.

## Services

### `GET /api/services`

Returns all stored services, ordered by name. A service includes `id`, `name`, `containerId`, `status`, `healthStatus`, `isEnabled`, `lastCheckedAt`, `createdAt`, and `updatedAt`.

```json
{
  "data": [
    {
      "id": "cmw2iuql9000001mpn5uij2sx",
      "name": "self-healing-demo-app",
      "containerId": "self-healing-demo-app",
      "status": "RUNNING",
      "healthStatus": "HEALTHY",
      "isEnabled": true,
      "lastCheckedAt": "2026-11-05T17:45:40.874Z",
      "createdAt": "2026-11-04T19:40:44.446Z",
      "updatedAt": "2026-11-05T17:45:40.874Z"
    }
  ]
}
```

Service status values: `UNKNOWN`, `RUNNING`, `STOPPED`, `UNAVAILABLE`. Health values: `UNKNOWN`, `HEALTHY`, `UNHEALTHY`, `NOT_CONFIGURED`.

### `GET /api/services/:id`

Returns one service. IDs must match the generated Prisma CUID format (`c` followed by 24 lowercase alphanumeric characters). A malformed ID returns HTTP 400; a well-formed ID with no record returns HTTP 404.

## Incidents

### `GET /api/incidents`

Returns incidents ordered newest first, including the related service. Query parameters:

| Parameter | Default | Constraints |
| --- | --- | --- |
| `page` | `1` | Integer, at least 1. |
| `limit` | `20` | Integer, 1–100. |
| `status` | none | `ACTIVE` or `RESOLVED`. |

Example: `GET /api/incidents?page=1&limit=20&status=ACTIVE`

```json
{
  "data": [
    {
      "id": "cmw3uie8c000101o7nya615rj",
      "serviceId": "cmw2iuql9000001mpn5uij2sx",
      "incidentType": "CONTAINER_STOPPED",
      "severity": "HIGH",
      "description": "Configured container \"self-healing-demo-app\" is stopped.",
      "status": "ACTIVE",
      "detectedAt": "2026-11-05T16:43:20.015Z",
      "resolvedAt": null,
      "createdAt": "2026-11-05T16:43:20.015Z",
      "service": { "id": "cmw2iuql9000001mpn5uij2sx", "name": "self-healing-demo-app" }
    }
  ],
  "pagination": { "page": 1, "limit": 20, "total": 1, "pages": 1 }
}
```

The related `service` object contains its service fields; it is shortened above for readability. Incident types are `CONTAINER_STOPPED`, `CONTAINER_UNHEALTHY`, and `CONTAINER_UNAVAILABLE`. Severity values are `LOW`, `MEDIUM`, `HIGH`, and `CRITICAL`; the monitor currently assigns `HIGH` to stopped/unhealthy incidents and `MEDIUM` to unavailable incidents. Status is `ACTIVE` or `RESOLVED`.

### `GET /api/incidents/:id`

Returns one incident including its service. Malformed IDs return HTTP 400; a valid but unknown ID returns HTTP 404.

### `GET /api/incidents/:id/evidence`

Returns the incident's collected evidence ordered by collection time. Each item includes its type, JSON content, collection timestamp, collection status, and any collection error. A known incident with no evidence returns `{"data":[]}`. An unknown incident returns HTTP 404.

### `GET /api/incidents/:id/diagnosis`

Returns the latest diagnosis record, or `{"data":null}` if the incident has no diagnosis yet. An unknown incident returns HTTP 404.

### `POST /api/incidents/:id/diagnose`

Runs the deterministic diagnosis engine and persists a new diagnosis history record. The request has no body. A new diagnosis returns HTTP 201 with the record in `data` and `meta.reusedInFlight=false`. A concurrent request for the same incident shares the in-flight result and returns HTTP 200 with `meta.reusedInFlight=true`. Deduplication is held in the current backend process; the Compose deployment runs one backend instance. An unknown incident returns HTTP 404.

### `GET /api/diagnoses`

Returns paginated diagnosis history, newest first. Query parameters:

| Parameter | Default | Constraints |
| --- | --- | --- |
| `page` | `1` | Integer, at least 1. |
| `limit` | `20` | Integer, 1–100. |
| `incidentId` | none | Generated CUID format. |
| `diagnosisType` | none | `APPLICATION_CRASH`, `OUT_OF_MEMORY`, `HEALTH_CHECK_FAILURE`, `STARTUP_FAILURE`, `CONTAINER_UNAVAILABLE`, or `UNKNOWN_FAILURE`. |
| `diagnosisMethod` | none | `RULE_BASED` or `LLM`. |
| `confidence` | none | `LOW`, `MEDIUM`, `HIGH`, or `INCONCLUSIVE`. |

Example: `GET /api/diagnoses?page=1&limit=20&diagnosisMethod=RULE_BASED&confidence=MEDIUM`

## Errors

| HTTP status | Error code | Meaning |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | Invalid ID format or query value. |
| 404 | `NOT_FOUND` | Route or well-formed resource ID does not exist. |
| 500 | `INTERNAL_SERVER_ERROR` | Unexpected server/database error; internal details are not returned. |

Validation errors have the shape `{"error":{"code":"VALIDATION_ERROR","message":"Request validation failed","details":[...]}}`. Unknown routes return `NOT_FOUND`.

## CORS

The backend allows origins listed in `FRONTEND_ORIGINS` in the root `.env` (default: localhost and 127.0.0.1 on port 5173). The middleware permits GET, POST, and OPTIONS and does not enable credentials. The API cannot create incidents or change service enablement; the diagnosis POST only evaluates and stores a diagnosis.
