import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Diagnosis } from '../src/generated/prisma/client.js';
import {
  createDiagnosisApiService,
  type DiagnosisApiRepository,
} from '../src/diagnosis/diagnosis-api-service.js';
import { IncidentNotFoundError } from '../src/diagnosis/diagnosis-engine.js';

const exampleDiagnosis = { id: 'diagnosis-1', incidentId: 'incident-1' } as Diagnosis;

function repository(overrides: Partial<DiagnosisApiRepository> = {}): DiagnosisApiRepository {
  return {
    findIncidentEvidence: async () => [],
    incidentExists: async () => true,
    findLatestDiagnosis: async () => exampleDiagnosis,
    listDiagnosisHistory: async () => ({ items: [exampleDiagnosis], total: 1 }),
    ...overrides,
  };
}

test('returns empty evidence for a known incident and not-found for an unknown incident', async () => {
  const service = createDiagnosisApiService(repository({
    findIncidentEvidence: async (id) => id === 'known' ? [] : null,
  }));
  assert.deepEqual(await service.getEvidence('known'), []);
  await assert.rejects(() => service.getEvidence('missing'), IncidentNotFoundError);
});

test('returns a nullable latest diagnosis only after confirming the incident exists', async () => {
  const service = createDiagnosisApiService(repository({
    incidentExists: async (id) => id === 'known',
    findLatestDiagnosis: async () => null,
  }));
  assert.equal(await service.getLatestDiagnosis('known'), null);
  await assert.rejects(() => service.getLatestDiagnosis('missing'), IncidentNotFoundError);
});

test('passes pagination and filters through to diagnosis history storage', async () => {
  let received: unknown;
  const service = createDiagnosisApiService(repository({
    listDiagnosisHistory: async (query) => {
      received = query;
      return { items: [exampleDiagnosis], total: 1 };
    },
  }));
  const query = { page: 2, limit: 10, incidentId: 'incident-1', diagnosisMethod: 'RULE_BASED' as const };
  const result = await service.listDiagnosisHistory(query);
  assert.deepEqual(received, query);
  assert.equal(result.total, 1);
});

test('shares an in-flight run per incident but permits a later explicit diagnosis', async () => {
  let calls = 0;
  const releases: Array<(value: Diagnosis) => void> = [];
  const service = createDiagnosisApiService(repository(), () => {
    calls += 1;
    return new Promise<Diagnosis>((resolve) => { releases.push(resolve); });
  });

  const first = service.triggerDiagnosis('incident-1');
  const concurrent = service.triggerDiagnosis('incident-1');
  assert.equal(calls, 1);
  releases[0](exampleDiagnosis);
  const [firstResult, concurrentResult] = await Promise.all([first, concurrent]);
  assert.equal(firstResult.reusedInFlight, false);
  assert.equal(concurrentResult.reusedInFlight, true);
  assert.equal(firstResult.diagnosis.id, concurrentResult.diagnosis.id);

  const laterPromise = service.triggerDiagnosis('incident-1');
  assert.equal(calls, 2);
  releases[1](exampleDiagnosis);
  const later = await laterPromise;
  assert.equal(later.reusedInFlight, false);
});
