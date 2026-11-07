import assert from 'node:assert/strict';
import { test } from 'node:test';
import { IncidentNotFoundError, diagnoseIncident, type DiagnosisRepository } from '../src/diagnosis/diagnosis-engine.js';

const incident = {
  id: 'incident-1',
  incidentType: 'CONTAINER_STOPPED' as const,
  description: 'Container is stopped',
  evidence: [
    { evidenceType: 'CONTAINER_STATE' as const, collectionStatus: 'COMPLETE' as const, content: { state: 'exited', running: false } },
    { evidenceType: 'EXIT_CODE' as const, collectionStatus: 'COMPLETE' as const, content: { exitCode: 1 } },
  ],
};

test('loads incident evidence and appends a persisted diagnosis history record', async () => {
  let saved: Record<string, unknown> | undefined;
  const repository: DiagnosisRepository = {
    findIncidentById: async (id) => id === incident.id ? incident : null,
    createDiagnosis: async (data) => {
      saved = data;
      return { id: 'diagnosis-1', ...data };
    },
  };

  const result = await diagnoseIncident(incident.id, repository) as { id: string };

  assert.equal(result.id, 'diagnosis-1');
  assert.equal(saved?.incidentId, incident.id);
  assert.equal(saved?.diagnosisType, 'APPLICATION_CRASH');
  assert.equal(saved?.diagnosisMethod, 'RULE_BASED');
});

test('reports an unknown incident without attempting persistence', async () => {
  let persisted = false;
  const repository: DiagnosisRepository = {
    findIncidentById: async () => null,
    createDiagnosis: async () => { persisted = true; return {}; },
  };

  await assert.rejects(() => diagnoseIncident('missing', repository), IncidentNotFoundError);
  assert.equal(persisted, false);
});
