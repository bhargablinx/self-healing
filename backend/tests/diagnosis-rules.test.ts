import assert from 'node:assert/strict';
import { test } from 'node:test';
import { evaluateDiagnosis } from '../src/diagnosis/diagnosis-rules.js';

function item(evidenceType: string, content: unknown, collectionStatus = 'COMPLETE') {
  return { evidenceType, content, collectionStatus };
}

test('diagnoses confirmed OOM with high confidence', () => {
  const result = evaluateDiagnosis({
    incidentType: 'CONTAINER_STOPPED',
    evidence: [item('EXIT_CODE', { exitCode: 137, oomKilled: true })],
  });
  assert.equal(result.diagnosisType, 'OUT_OF_MEMORY');
  assert.equal(result.confidence, 'HIGH');
  assert.match(result.supportingEvidence[0], /OOMKilled=true/);
});

test('does not infer OOM from exit code 137 alone', () => {
  const result = evaluateDiagnosis({
    incidentType: 'CONTAINER_STOPPED',
    evidence: [
      item('CONTAINER_STATE', { state: 'exited', running: false }),
      item('EXIT_CODE', { exitCode: 137, oomKilled: false }),
    ],
  });
  assert.equal(result.diagnosisType, 'APPLICATION_CRASH');
  assert.equal(result.confidence, 'LOW');
  assert.match(result.explanation, /does not identify the root cause/);
});

test('diagnoses application crashes more confidently when logs contain an error', () => {
  const result = evaluateDiagnosis({
    incidentType: 'CONTAINER_STOPPED',
    evidence: [
      item('CONTAINER_STATE', { state: 'exited', running: false }),
      item('EXIT_CODE', { exitCode: 1 }),
      item('CONTAINER_LOGS', { stdout: '', stderr: 'uncaught exception in worker' }),
    ],
  });
  assert.equal(result.diagnosisType, 'APPLICATION_CRASH');
  assert.equal(result.confidence, 'MEDIUM');
  assert.ok(result.supportingEvidence.some((value) => /logs contain error-related/.test(value)));
});

test('requires repeated failed checks for a health-check diagnosis', () => {
  const evidence = [
    item('CONTAINER_STATE', { state: 'running', running: true }),
    item('HEALTH_CHECK', { status: 'unhealthy', failingStreak: 1, recentChecks: [] }),
  ];
  const result = evaluateDiagnosis({ incidentType: 'CONTAINER_UNHEALTHY', evidence });
  assert.equal(result.diagnosisType, 'UNKNOWN_FAILURE');
  assert.equal(result.confidence, 'INCONCLUSIVE');
});

test('diagnoses repeated health-check failures with evidence', () => {
  const result = evaluateDiagnosis({
    incidentType: 'CONTAINER_UNHEALTHY',
    evidence: [
      item('CONTAINER_STATE', { state: 'running', running: true }),
      item('HEALTH_CHECK', { status: 'unhealthy', failingStreak: 3, recentChecks: [{ exitCode: 1, output: 'probe failed' }] }),
    ],
  });
  assert.equal(result.diagnosisType, 'HEALTH_CHECK_FAILURE');
  assert.equal(result.confidence, 'HIGH');
});

test('diagnoses startup failures only when exit, startup logs, health, and timing align', () => {
  const result = evaluateDiagnosis({
    incidentType: 'CONTAINER_STOPPED',
    evidence: [
      item('CONTAINER_STATE', { state: 'exited', running: false }),
      item('EXIT_CODE', { exitCode: 1, finishedAt: '2026-11-08T12:01:00.000Z' }),
      item('CONTAINER_METADATA', { startedAt: '2026-11-08T12:00:00.000Z' }),
      item('HEALTH_CHECK', { status: 'unhealthy', failingStreak: 1 }),
      item('CONTAINER_LOGS', { stdout: 'starting server', stderr: 'startup error: unable to bind port' }),
    ],
  });
  assert.equal(result.diagnosisType, 'STARTUP_FAILURE');
  assert.equal(result.confidence, 'MEDIUM');
});

test('diagnoses a confirmed unavailable container without asserting intentional removal', () => {
  const result = evaluateDiagnosis({ incidentType: 'CONTAINER_UNAVAILABLE', evidence: [] });
  assert.equal(result.diagnosisType, 'CONTAINER_UNAVAILABLE');
  assert.match(result.explanation, /cannot determine whether the removal was intentional/);
  assert.ok(result.missingEvidence.some((value) => /Operator intent/.test(value)));
});

test('failed evidence is not used to claim a cause', () => {
  const result = evaluateDiagnosis({
    incidentType: 'CONTAINER_STOPPED',
    evidence: [
      item('CONTAINER_STATE', { state: 'exited', running: false }, 'FAILED'),
      item('EXIT_CODE', { exitCode: 1 }, 'FAILED'),
      item('HEALTH_CHECK', { status: 'unknown' }, 'FAILED'),
      item('CONTAINER_LOGS', { stderr: 'fatal exception' }, 'FAILED'),
    ],
  });
  assert.equal(result.diagnosisType, 'UNKNOWN_FAILURE');
  assert.deepEqual(result.supportingEvidence, []);
  assert.ok(result.missingEvidence.every((value) => /collection failed/.test(value)));
});
