import { useEffect, useMemo, useState } from 'react';

type ServiceStatus = 'UNKNOWN' | 'RUNNING' | 'STOPPED' | 'UNAVAILABLE';
type HealthStatus = 'UNKNOWN' | 'HEALTHY' | 'UNHEALTHY' | 'NOT_CONFIGURED';
type IncidentStatus = 'ACTIVE' | 'RESOLVED';
type IncidentType = 'CONTAINER_STOPPED' | 'CONTAINER_UNHEALTHY' | 'CONTAINER_UNAVAILABLE';
type EvidenceType = 'CONTAINER_STATE' | 'CONTAINER_LOGS' | 'EXIT_CODE' | 'HEALTH_CHECK' | 'RESTART_COUNT' | 'CONTAINER_METADATA';
type DiagnosisType = 'APPLICATION_CRASH' | 'OUT_OF_MEMORY' | 'HEALTH_CHECK_FAILURE' | 'STARTUP_FAILURE' | 'CONTAINER_UNAVAILABLE' | 'UNKNOWN_FAILURE';
type DiagnosisConfidence = 'LOW' | 'MEDIUM' | 'HIGH' | 'INCONCLUSIVE';
type DiagnosisMethod = 'RULE_BASED' | 'LLM';

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

interface IncidentEvidence {
  id: string;
  incidentId: string;
  evidenceType: EvidenceType;
  content: unknown;
  collectedAt: string;
  collectionStatus: 'COMPLETE' | 'PARTIAL' | 'FAILED';
  collectionError: string | null;
}

interface Diagnosis {
  id: string;
  incidentId: string;
  diagnosisType: DiagnosisType;
  probableCause: string;
  explanation: string;
  confidence: DiagnosisConfidence;
  supportingEvidence: string[];
  missingEvidence: string[];
  diagnosisMethod: DiagnosisMethod;
  createdAt: string;
}

interface IncidentDetails {
  incidentId: string;
  evidence: IncidentEvidence[];
  latestDiagnosis: Diagnosis | null;
  diagnosisHistory: Diagnosis[];
}

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3001').replace(/\/$/, '');
const POLL_INTERVAL_MS = 5_000;

async function getJson<T>(path: string, signal: AbortSignal): Promise<T> {
  return requestJson<T>(path, { signal });
}

async function postJson<T>(path: string): Promise<T> {
  return requestJson<T>(path, { method: 'POST' });
}

async function requestJson<T>(path: string, options: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, options);
  const payload = await response.json().catch(() => null) as { error?: { message?: string } } | null;
  if (!response.ok) {
    throw new Error(payload?.error?.message ?? `API request failed (${response.status})`);
  }
  return payload as T;
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

function diagnosisLabel(type: DiagnosisType): string {
  return type.toLowerCase().replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function contentObject(evidence: IncidentEvidence | undefined): Record<string, unknown> {
  return objectValue(evidence?.content) ?? {};
}

function objectValue(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return 'Unavailable';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
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
  const [detailRefreshKey, setDetailRefreshKey] = useState(0);
  const [incidentDetails, setIncidentDetails] = useState<IncidentDetails | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [diagnosisActionError, setDiagnosisActionError] = useState<string | null>(null);
  const [diagnosingIncidentId, setDiagnosingIncidentId] = useState<string | null>(null);

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

  useEffect(() => {
    if (!selectedIncidentId) {
      setIncidentDetails(null);
      setDetailError(null);
      setDetailLoading(false);
      return;
    }

    let cancelled = false;
    let timer: number | undefined;
    let controller: AbortController | null = null;
    setIncidentDetails(null);
    setDetailError(null);
    setDetailLoading(true);

    const refreshDetails = async (): Promise<void> => {
      controller = new AbortController();
      try {
        const [evidenceResponse, diagnosisResponse, historyResponse] = await Promise.all([
          getJson<{ data: IncidentEvidence[] }>(`/api/incidents/${selectedIncidentId}/evidence`, controller.signal),
          getJson<{ data: Diagnosis | null }>(`/api/incidents/${selectedIncidentId}/diagnosis`, controller.signal),
          getJson<ListResponse<Diagnosis>>(`/api/diagnoses?incidentId=${encodeURIComponent(selectedIncidentId)}&page=1&limit=5`, controller.signal),
        ]);
        if (cancelled) return;
        setIncidentDetails({
          incidentId: selectedIncidentId,
          evidence: evidenceResponse.data,
          latestDiagnosis: diagnosisResponse.data,
          diagnosisHistory: historyResponse.data,
        });
        setDetailError(null);
      } catch (requestError) {
        if (cancelled || (requestError instanceof DOMException && requestError.name === 'AbortError')) return;
        setDetailError(requestError instanceof Error ? requestError.message : 'Could not load incident evidence.');
      } finally {
        if (!cancelled) {
          setDetailLoading(false);
          timer = window.setTimeout(() => void refreshDetails(), POLL_INTERVAL_MS);
        }
      }
    };

    void refreshDetails();
    return () => {
      cancelled = true;
      controller?.abort();
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [selectedIncidentId, detailRefreshKey]);

  const selectedIncident = useMemo(
    () => incidents?.find((incident) => incident.id === selectedIncidentId) ?? null,
    [incidents, selectedIncidentId],
  );
  const healthyCount = services?.filter((service) => service.status === 'RUNNING'
    && service.healthStatus !== 'UNHEALTHY').length ?? 0;
  const attentionCount = (services?.length ?? 0) - healthyCount;

  const runDiagnosis = async (incidentId: string): Promise<void> => {
    setDiagnosisActionError(null);
    setDiagnosingIncidentId(incidentId);
    try {
      await postJson(`/api/incidents/${incidentId}/diagnose`);
      setDetailRefreshKey((value) => value + 1);
    } catch (requestError) {
      setDiagnosisActionError(requestError instanceof Error ? requestError.message : 'Diagnosis failed. Please try again.');
    } finally {
      setDiagnosingIncidentId((current) => current === incidentId ? null : current);
    }
  };

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
                <IncidentInvestigationPanel
                  details={incidentDetails?.incidentId === selectedIncident.id ? incidentDetails : null}
                  loading={detailLoading}
                  error={detailError}
                  actionError={diagnosisActionError}
                  diagnosing={diagnosingIncidentId === selectedIncident.id}
                  onRetry={() => setDetailRefreshKey((value) => value + 1)}
                  onRunDiagnosis={() => void runDiagnosis(selectedIncident.id)}
                />
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
        <footer className="page-footer">Self-Healing Software <span>·</span> Monitoring, evidence and diagnosis <span>·</span> Recovery remains manual</footer>
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

function IncidentInvestigationPanel({
  details,
  loading,
  error,
  actionError,
  diagnosing,
  onRetry,
  onRunDiagnosis,
}: {
  details: IncidentDetails | null;
  loading: boolean;
  error: string | null;
  actionError: string | null;
  diagnosing: boolean;
  onRetry: () => void;
  onRunDiagnosis: () => void;
}) {
  const evidenceFor = (type: EvidenceType) => details?.evidence.find((item) => item.evidenceType === type);
  const stateEvidence = evidenceFor('CONTAINER_STATE');
  const exitEvidence = evidenceFor('EXIT_CODE');
  const restartEvidence = evidenceFor('RESTART_COUNT');
  const healthEvidence = evidenceFor('HEALTH_CHECK');
  const logEvidence = evidenceFor('CONTAINER_LOGS');
  const state = contentObject(stateEvidence);
  const exit = contentObject(exitEvidence);
  const restart = contentObject(restartEvidence);
  const health = contentObject(healthEvidence);
  const logs = contentObject(logEvidence);
  const healthChecks = Array.isArray(health.recentChecks) ? health.recentChecks : [];
  const diagnosis = details?.latestDiagnosis ?? null;

  return (
    <div className="investigation-sections">
      <section className="investigation-section" aria-labelledby="evidence-title">
        <div className="investigation-heading">
          <div><p className="eyebrow">COLLECTED DATA</p><h3 id="evidence-title">Diagnostic evidence</h3></div>
          {details && <span className="count-badge">{details.evidence.length} records</span>}
        </div>
        {loading && !details && <p className="investigation-message">Loading diagnostic evidence…</p>}
        {error && <div className="investigation-error" role="alert">{error}<button className="text-button" onClick={onRetry}>Retry</button></div>}
        {details && details.evidence.length === 0 && (
          <p className="investigation-message">Evidence has not been collected yet. It is captured after a failure is detected.</p>
        )}
        {details && details.evidence.length > 0 && (
          <>
            <dl className="evidence-grid">
              <EvidenceValue label="Container name" record={stateEvidence} value={state.containerName ?? state.serviceName} />
              <EvidenceValue label="Container ID" record={stateEvidence} value={state.containerId} />
              <EvidenceValue label="State" record={stateEvidence} value={state.state} />
              <EvidenceValue label="Exit code" record={exitEvidence} value={exit.exitCode} />
              <EvidenceValue label="OOM killed" record={exitEvidence} value={exit.oomKilled} />
              <EvidenceValue label="Restart count" record={restartEvidence} value={restart.restartCount} />
              <EvidenceValue label="Health status" record={healthEvidence} value={health.status} />
              <EvidenceValue label="Failed checks" record={healthEvidence} value={health.failingStreak} />
            </dl>
            {healthChecks.length > 0 && (
              <div className="health-check-output">
                <span className="evidence-label">Recent health checks</span>
                {healthChecks.slice(-3).map((entry, index) => {
                  const check = objectValue(entry) ?? {};
                  return <p key={`${String(check.finishedAt ?? '')}-${index}`}>Exit {displayValue(check.exitCode)}{typeof check.output === 'string' && check.output ? ` · ${check.output}` : ''}</p>;
                })}
              </div>
            )}
            <LogEvidence label="Standard output" value={logs.stdout} evidence={logEvidence} />
            <LogEvidence label="Standard error" value={logs.stderr} evidence={logEvidence} />
            <ul className="evidence-timestamps" aria-label="Evidence collection times">
              {details.evidence.map((item) => (
                <li key={item.id}>
                  <span>{evidenceLabel(item.evidenceType)}</span>
                  <span className={item.collectionStatus === 'FAILED' ? 'evidence-failed' : ''}>
                    {item.collectionStatus === 'FAILED' ? 'Unavailable' : formatDate(item.collectedAt)}
                  </span>
                  {item.collectionStatus === 'FAILED' && item.collectionError && <small>{item.collectionError}</small>}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section className="investigation-section" aria-labelledby="diagnosis-title">
        <div className="investigation-heading">
          <div><p className="eyebrow">RULE-BASED ANALYSIS</p><h3 id="diagnosis-title">Diagnosis</h3></div>
          <button className="button button-dark run-diagnosis-button" onClick={onRunDiagnosis} disabled={diagnosing}>
            {diagnosing ? 'Running…' : 'Run Diagnosis'}
          </button>
        </div>
        {actionError && <div className="investigation-error" role="alert">{actionError}</div>}
        {loading && !details && <p className="investigation-message">Loading diagnosis…</p>}
        {details && !diagnosis && <p className="investigation-message">No diagnosis has been run for this incident yet.</p>}
        {diagnosis && (
          <>
            <div className="diagnosis-summary">
              <div className="diagnosis-title-row">
                <strong>{diagnosisLabel(diagnosis.diagnosisType)}</strong>
                <span className={`confidence-pill confidence-${diagnosis.confidence.toLowerCase()}`}>{diagnosis.confidence}</span>
              </div>
              <p className="probable-cause">{diagnosis.probableCause}</p>
              <p className="diagnosis-explanation">{diagnosis.explanation}</p>
              <p className="diagnosis-meta">{diagnosis.diagnosisMethod.replace('_', ' ')} · {formatDate(diagnosis.createdAt)}</p>
            </div>
            <EvidenceList title="Supporting evidence" values={diagnosis.supportingEvidence} emptyText="No evidence supports a specific cause." />
            <EvidenceList title="Missing evidence" values={diagnosis.missingEvidence} emptyText="No additional evidence is listed." />
          </>
        )}
        {details && details.diagnosisHistory.length > 0 && (
          <div className="diagnosis-history">
            <span className="evidence-label">Diagnosis history</span>
            <ul>
              {details.diagnosisHistory.map((item, index) => (
                <li key={item.id}>
                  <span><strong>{index === 0 ? 'Latest' : diagnosisLabel(item.diagnosisType)}</strong><small>{item.diagnosisMethod.replace('_', ' ')} · {formatDate(item.createdAt)}</small></span>
                  <span className={`confidence-pill confidence-${item.confidence.toLowerCase()}`}>{item.confidence}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}

function EvidenceValue({ label, record, value }: { label: string; record: IncidentEvidence | undefined; value: unknown }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{record?.collectionStatus === 'FAILED' ? 'Unavailable' : displayValue(value)}</dd>
    </div>
  );
}

function LogEvidence({ label, value, evidence }: { label: string; value: unknown; evidence: IncidentEvidence | undefined }) {
  const text = typeof value === 'string' ? value : '';
  return (
    <div className="log-evidence">
      <span className="evidence-label">{label}</span>
      {evidence?.collectionStatus === 'FAILED'
        ? <p className="investigation-message">Log collection failed: {evidence.collectionError ?? 'No details available.'}</p>
        : <pre>{text || 'No recent output.'}</pre>}
    </div>
  );
}

function EvidenceList({ title, values, emptyText }: { title: string; values: string[]; emptyText: string }) {
  return (
    <div className="diagnosis-evidence-list">
      <span className="evidence-label">{title}</span>
      {values.length > 0
        ? <ul>{values.map((value, index) => <li key={`${value}-${index}`}>{value}</li>)}</ul>
        : <p>{emptyText}</p>}
    </div>
  );
}

function evidenceLabel(type: EvidenceType): string {
  return type.toLowerCase().replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default App;
