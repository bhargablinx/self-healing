import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HealthStatus, IncidentType, ServiceStatus } from '../src/generated/prisma/client.js';
import type { FailureToRecord } from '../src/incidents/incident-service.js';

process.env.DATABASE_URL ??= 'postgresql://test:test@127.0.0.1:5432/self_healing_test';
const { ContainerMonitor } = await import('../src/monitoring/monitor.js');

const enabledService = { id: 'service-1', name: 'test-service', isEnabled: true };

test('skips Docker inspection and incident work for a disabled service', async () => {
  let inspected = false;
  let reconciled = false;
  const monitor = new ContainerMonitor({
    monitoredContainers: ['test-container'],
    findService: async () => ({ ...enabledService, isEnabled: false }),
    inspectContainer: async () => {
      inspected = true;
      throw new Error('must not inspect disabled target');
    },
    upsertService: async () => { throw new Error('must not update disabled target'); },
    reconcileIncident: async () => {
      reconciled = true;
      return null;
    },
  });

  await monitor.pollOnce();

  assert.equal(inspected, false);
  assert.equal(reconciled, false);
});

test('does not update service or create an incident after a transient Docker error', async () => {
  let upserted = false;
  let reconciled = false;
  const monitor = new ContainerMonitor({
    monitoredContainers: ['test-container'],
    findService: async () => enabledService,
    inspectContainer: async () => { throw new Error('temporary socket failure'); },
    upsertService: async () => {
      upserted = true;
      return enabledService;
    },
    reconcileIncident: async () => {
      reconciled = true;
      return null;
    },
  });

  await monitor.pollOnce();

  assert.equal(upserted, false);
  assert.equal(reconciled, false);
});

test('treats a confirmed Docker 404 as unavailable', async () => {
  let observation: { status: ServiceStatus; healthStatus: HealthStatus } | undefined;
  let recordedFailure: FailureToRecord | null = null;
  const monitor = new ContainerMonitor({
    monitoredContainers: ['test-container'],
    findService: async () => enabledService,
    inspectContainer: async () => { throw Object.assign(new Error('not found'), { statusCode: 404 }); },
    upsertService: async (_name, value) => {
      observation = value;
      return enabledService;
    },
    reconcileIncident: async (_serviceId, failure) => {
      recordedFailure = failure;
      return null;
    },
  });

  await monitor.pollOnce();

  assert.equal(observation?.status, ServiceStatus.UNAVAILABLE);
  assert.equal(observation?.healthStatus, HealthStatus.UNKNOWN);
  assert.equal(recordedFailure?.incidentType, IncidentType.CONTAINER_UNAVAILABLE);
});

test('starts evidence collection only after the incident exists and does not await it', async () => {
  let resolveCollection!: () => void;
  let collectionStarted = false;
  const collection = new Promise<void>((resolve) => { resolveCollection = resolve; });
  const monitor = new ContainerMonitor({
    monitoredContainers: ['test-container'],
    findService: async () => enabledService,
    inspectContainer: async () => { throw Object.assign(new Error('not found'), { statusCode: 404 }); },
    upsertService: async () => enabledService,
    reconcileIncident: async () => ({ id: 'incident-1' }) as never,
    collectEvidence: () => { collectionStarted = true; return collection as unknown as void; },
  });

  await monitor.pollOnce();

  assert.equal(collectionStarted, true);
  resolveCollection();
});
