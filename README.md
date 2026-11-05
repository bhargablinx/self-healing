# Self-Healing Software

V1 monitors selected Docker containers, records incidents in PostgreSQL, and displays them in a web dashboard. It does not diagnose root causes or restart containers automatically.

## Run locally

Requirements: Docker Engine, the Docker Compose plugin, and access to `/var/run/docker.sock`.

```bash
cp .env.example .env
stat -c '%g' /var/run/docker.sock
docker compose up --build -d
docker compose ps
```

On Linux, copy the `stat` output into `DOCKER_GID` in `.env` before starting Compose.

Open the dashboard at <http://localhost:5173>. The API health endpoint is <http://localhost:3001/api/health> and the demo app is <http://localhost:4000>.

To see an incident appear, run `docker compose stop demo-app` and wait about 5–10 seconds. Restore the demo with `docker compose start demo-app`; the incident should resolve after the monitor sees it healthy again.

Stop the services with `docker compose down`. Data stays in the `postgres_data` volume. `docker compose down -v` also deletes the database.

## Documentation

- [Documentation index](docs/README.md)
- [Architecture](docs/architecture.md)
- [Configuration and local setup](docs/configuration.md)
- [API reference](docs/api.md)
- [Operations and data model](docs/operations.md)
- [Development, verification, and security](docs/development.md)
- [Project scope and roadmap](context.md)
