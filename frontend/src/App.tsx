import { useEffect, useMemo, useState } from 'react';

type ServiceStatus = 'UNKNOWN' | 'RUNNING' | 'STOPPED' | 'UNAVAILABLE';
type HealthStatus = 'UNKNOWN' | 'HEALTHY' | 'UNHEALTHY' | 'NOT_CONFIGURED';
type IncidentStatus = 'ACTIVE' | 'RESOLVED';
type IncidentType = 'CONTAINER_STOPPED' | 'CONTAINER_UNHEALTHY' | 'CONTAINER_UNAVAILABLE';

interface Service {
  id: string;
  name: string;
  containerId: string;
  status: ServiceStatus;
  healthStatus: HealthStatus;
  isEnabled: boolean;
  lastCheckedAt: string | null;
}

interface Incident {
  id: string;
  serviceId: string;
  incidentType: IncidentType;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  description: string;
  status: IncidentStatus;
  detectedAt: string;
  resolvedAt: string | null;
  service: Service;
}

interface ListResponse<T> {
  data: T[];
  pagination?: { page: number; limit: number; total: number; pages: number };
}

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3001').replace(/\/$/, '');
const POLL_INTERVAL_MS = 5_000;

async function getJson<T>(path: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, { signal });
  if (!response.ok) {
    throw new Error(`API request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}

function formatDate(value: string | null): string {
  if (!value) return 'Not checked yet';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function incidentLabel(type: IncidentType): string {
  switch (type) {
    case 'CONTAINER_STOPPED': return 'Container stopped';
    case 'CONTAINER_UNHEALTHY': return 'Health check failed';
    case 'CONTAINER_UNAVAILABLE': return 'Container unavailable';
  }
}

function serviceTone(service: Service): 'good' | 'bad' | 'neutral' {
  if (service.status !== 'RUNNING' || service.healthStatus === 'UNHEALTHY') return 'bad';
  if (service.status === 'RUNNING' && service.healthStatus === 'HEALTHY') return 'good';
  return 'neutral';
}

function StatusPill({ service }: { service: Service }) {
  const tone = serviceTone(service);
  const label = service.status === 'RUNNING' && service.healthStatus === 'UNHEALTHY'
    ? 'Unhealthy'
    : service.status.charAt(0) + service.status.slice(1).toLowerCase();
  return (
    <span className={`status-pill status-${tone}`}>
      <span className="status-dot" />{label}
    </span>
  );
}

function App() {
  const [services, setServices] = useState<Service[] | null>(null);
  const [incidents, setIncidents] = useState<Incident[] | null>(null);
  const [activeCount, setActiveCount] = useState(0);
  const [selectedIncidentId, setSelectedIncidentId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    let controller: AbortController | null = null;

    const poll = async (): Promise<void> => {
      controller = new AbortController();
      try {
        const [serviceResponse, incidentResponse, activeResponse] = await Promise.all([
          getJson<{ data: Service[] }>('/api/services', controller.signal),
          getJson<ListResponse<Incident>>('/api/incidents?page=1&limit=8', controller.signal),
          getJson<ListResponse<Incident>>('/api/incidents?page=1&limit=1&status=ACTIVE', controller.signal),
        ]);
        if (cancelled) return;
        setServices(serviceResponse.data);
        setIncidents(incidentResponse.data);
        setActiveCount(activeResponse.pagination?.total ?? 0);
        setError(null);
        setLastUpdated(new Date().toISOString());
      } catch (requestError) {
        if (cancelled || (requestError instanceof DOMException && requestError.name === 'AbortError')) return;
        setError(requestError instanceof Error ? requestError.message : 'Could not load dashboard data.');
      } finally {
        if (!cancelled) timer = window.setTimeout(() => void poll(), POLL_INTERVAL_MS);
      }
    };

    void poll();
    return () => {
      cancelled = true;
      controller?.abort();
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [refreshKey]);

  const selectedIncident = useMemo(
    () => incidents?.find((incident) => incident.id === selectedIncidentId) ?? null,
    [incidents, selectedIncidentId],
  );
  const healthyCount = services?.filter((service) => service.status === 'RUNNING'
    && service.healthStatus !== 'UNHEALTHY').length ?? 0;
  const attentionCount = (services?.length ?? 0) - healthyCount;

  if (!services || !incidents) {
    return (
      <main className="loading-screen">
        <div className="loading-mark">SH</div>
        <p>Loading operations dashboard…</p>
        {error && <div className="error-banner">{error}</div>}
        <button className="button button-dark" onClick={() => setRefreshKey((value) => value + 1)}>Try again</button>
      </main>
    );
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Self-Healing Software home">
          <span className="brand-mark">SH</span>
          <span className="brand-name">self-healing<span> / ops</span></span>
        </a>
        <div className="topbar-right">
          <span className="live-indicator"><span /> Live monitoring</span>
          <button className="button button-light" onClick={() => setRefreshKey((value) => value + 1)}>
            <span className="refresh-symbol">↻</span> Refresh
          </button>
        </div>
      </header>

      <main id="top" className="dashboard">
        <section className="page-heading">
          <div>
            <p className="eyebrow">OPERATIONS OVERVIEW</p>
            <h1>Good to see you.</h1>
            <p className="page-subtitle">A live view of your monitored services and incidents.</p>
          </div>
          <div className="updated-at">
            <span className="updated-dot" />
            Updated {lastUpdated ? formatDate(lastUpdated) : 'just now'}
          </div>
        </section>

        {error && (
          <div className="error-banner" role="alert">
            <span><strong>Could not refresh data.</strong> {error} Showing the last successful results.</span>
            <button className="text-button" onClick={() => setRefreshKey((value) => value + 1)}>Retry</button>
          </div>
        )}

        <section className="summary-grid" aria-label="Service summary">
          <SummaryCard label="Monitored services" value={services.length} note="Configured for monitoring" icon="◈" />
          <SummaryCard label="Healthy" value={healthyCount} note="Running as expected" icon="✓" tone="green" />
          <SummaryCard label="Needs attention" value={attentionCount} note="Stopped or unhealthy" icon="!" tone={attentionCount ? 'red' : 'default'} />
          <SummaryCard label="Active incidents" value={activeCount} note="Awaiting investigation" icon="⌁" tone={activeCount ? 'amber' : 'default'} />
        </section>

        <section className="panel services-panel">
          <div className="panel-heading">
            <div>
              <h2>Services</h2>
              <p>Current container state and latest health check.</p>
            </div>
            <span className="count-badge">{services.length} total</span>
          </div>
          {services.length === 0 ? (
            <EmptyState title="No services registered" detail="Add a container to MONITORED_CONTAINERS to begin monitoring." />
          ) : (
            <div className="table-scroll">
              <table>
                <thead><tr><th>Service</th><th>Container</th><th>Status</th><th>Health</th><th>Last checked</th></tr></thead>
                <tbody>
                  {services.map((service) => (
                    <tr key={service.id}>
                      <td><div className="service-name"><span className={`service-icon tone-${serviceTone(service)}`}>▣</span><strong>{service.name}</strong></div></td>
                      <td><code title={service.containerId}>{service.containerId.length > 24 ? `${service.containerId.slice(0, 12)}…${service.containerId.slice(-7)}` : service.containerId}</code></td>
                      <td><StatusPill service={service} /></td>
                      <td><span className={`health-label health-${service.healthStatus.toLowerCase()}`}>{healthLabel(service.healthStatus)}</span></td>
                      <td className="muted-cell">{formatDate(service.lastCheckedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="lower-grid">
          <div className="panel incidents-panel">
            <div className="panel-heading">
              <div>
                <h2>Recent incidents</h2>
                <p>Detected conditions and their current status.</p>
              </div>
              <span className="count-badge">{incidents.length} recent</span>
            </div>
            {incidents.length === 0 ? (
              <EmptyState title="No incidents yet" detail="When a monitored container fails, its incident will appear here." />
            ) : (
              <div className="incident-list">
                {incidents.map((incident) => (
                  <button
                    className={`incident-row ${selectedIncidentId === incident.id ? 'incident-selected' : ''}`}
                    key={incident.id}
                    onClick={() => setSelectedIncidentId(incident.id)}
                  >
                    <span className={`incident-type-icon ${incident.status === 'ACTIVE' ? 'incident-active' : ''}`}>!</span>
                    <span className="incident-main">
                      <span className="incident-title">{incident.service.name} <span className="incident-separator">·</span> {incidentLabel(incident.incidentType)}</span>
                      <span className="incident-meta">{formatDate(incident.detectedAt)} <span>·</span> {incident.severity.toLowerCase()} severity</span>
                    </span>
                    <span className={`incident-status status-text-${incident.status.toLowerCase()}`}>{incident.status === 'ACTIVE' ? 'Active' : 'Resolved'}</span>
                    <span className="row-chevron">›</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <aside className="panel detail-panel">
            <div className="panel-heading detail-heading">
              <div><p className="eyebrow">INCIDENT DETAIL</p><h2>{selectedIncident ? 'Selected incident' : 'At a glance'}</h2></div>
            </div>
            {selectedIncident ? (
              <div className="detail-content">
                <div className="detail-status-line">
                  <span className={`detail-status ${selectedIncident.status === 'ACTIVE' ? 'detail-status-active' : ''}`}><span />{selectedIncident.status === 'ACTIVE' ? 'Active' : 'Resolved'}</span>
                  <span className={`severity severity-${selectedIncident.severity.toLowerCase()}`}>{selectedIncident.severity}</span>
                </div>
                <h3>{incidentLabel(selectedIncident.incidentType)}</h3>
                <p className="detail-description">{selectedIncident.description}</p>
                <dl className="detail-list">
                  <div><dt>Affected service</dt><dd>{selectedIncident.service.name}</dd></div>
                  <div><dt>Container</dt><dd><code>{selectedIncident.service.containerId}</code></dd></div>
                  <div><dt>Detected</dt><dd>{formatDate(selectedIncident.detectedAt)}</dd></div>
                  <div><dt>Resolved</dt><dd>{formatDate(selectedIncident.resolvedAt)}</dd></div>
                </dl>
                <p className="manual-note">Recovery is manual. The system records and verifies observed status; it does not restart containers.</p>
              </div>
            ) : (
              <div className="detail-empty">
                <span className="detail-empty-icon">↖</span>
                <p>Select an incident to see its details.</p>
                <span>Service, failure type, severity, and timestamps will appear here.</span>
              </div>
            )}
          </aside>
        </section>
        <footer className="page-footer">Self-Healing Software <span>·</span> Detection and incident visibility only</footer>
      </main>
    </div>
  );
}

function healthLabel(status: HealthStatus): string {
  switch (status) {
    case 'HEALTHY': return 'Healthy';
    case 'UNHEALTHY': return 'Unhealthy';
    case 'NOT_CONFIGURED': return 'Not configured';
    case 'UNKNOWN': return 'Unknown';
  }
}

function SummaryCard({ label, value, note, icon, tone = 'default' }: {
  label: string;
  value: number;
  note: string;
  icon: string;
  tone?: 'default' | 'green' | 'red' | 'amber';
}) {
  return (
    <article className="summary-card">
      <div className="summary-top"><span>{label}</span><span className={`summary-icon icon-${tone}`}>{icon}</span></div>
      <strong className="summary-value">{value}</strong>
      <span className="summary-note">{note}</span>
    </article>
  );
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return <div className="empty-state"><span className="empty-mark">—</span><strong>{title}</strong><p>{detail}</p></div>;
}

export default App;
