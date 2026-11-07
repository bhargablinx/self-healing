import assert from 'node:assert/strict';
import { test } from 'node:test';
import { classifyFailure } from '../src/diagnosis/failure-classifier.js';

function evidence(evidenceType: string, content: unknown, collectionStatus = 'COMPLETE') {
  return { evidenceType, content, collectionStatus };
}

test('classifies explicit Docker OOMKilled evidence as out of memory', () => {
  const result = classifyFailure({
    incidentType: 'CONTAINER_STOPPED', evidence: [evidence('EXIT_CODE', { exitCode: 137, oomKilled: true })],
  });
  assert.equal(result.category, 'OUT_OF_MEMORY');
  assert.match(result.explanation, /Docker marked/);
});

test('does not infer OOM solely from exit code 137', () => {
  const result = classifyFailure({
    incidentType: 'CONTAINER_STOPPED',
    evidence: [evidence('CONTAINER_STATE', { state: 'exited', running: false }), evidence('EXIT_CODE', { exitCode: 137, oomKilled: false })],
  });
  assert.equal(result.category, 'APPLICATION_CRASH');
  assert.match(result.explanation, /does not identify the root cause/);
});

test('classifies a running unhealthy service only when health evidence records a failed check', () => {
  const result = classifyFailure({
    incidentType: 'CONTAINER_UNHEALTHY',
    evidence: [
      evidence('CONTAINER_STATE', { state: 'running', running: true }),
      evidence('HEALTH_CHECK', { status: 'unhealthy', failingStreak: 2, recentChecks: [] }),
    ],
  });
  assert.equal(result.category, 'HEALTH_CHECK_FAILURE');
});

test('classifies startup failure only with early exit, startup error logs, and failed health evidence', () => {
  const result = classifyFailure({
    incidentType: 'CONTAINER_STOPPED',
    evidence: [
      evidence('CONTAINER_STATE', { state: 'exited', running: false }),
      evidence('EXIT_CODE', { exitCode: 1, finishedAt: '2026-11-08T12:01:00.000Z' }),
      evidence('CONTAINER_METADATA', { startedAt: '2026-11-08T12:00:00.000Z' }),
      evidence('HEALTH_CHECK', { status: 'unhealthy', failingStreak: 1 }),
      evidence('CONTAINER_LOGS', { stdout: 'starting service', stderr: 'startup error: failed to bind' }),
    ],
  });
  assert.equal(result.category, 'STARTUP_FAILURE');
});

test('classifies confirmed missing containers without claiming intentional removal', () => {
  const result = classifyFailure({ incidentType: 'CONTAINER_UNAVAILABLE', evidence: [] });
  assert.equal(result.category, 'CONTAINER_UNAVAILABLE');
  assert.match(result.explanation, /does not establish whether it was intentionally removed/);
});

test('returns unknown when evidence is absent or failed', () => {
  const result = classifyFailure({
    incidentType: 'CONTAINER_STOPPED',
    evidence: [
      evidence('CONTAINER_STATE', { state: 'exited', running: false }, 'FAILED'),
      evidence('EXIT_CODE', { exitCode: 1 }, 'FAILED'),
    ],
  });
  assert.equal(result.category, 'UNKNOWN_FAILURE');
  assert.deepEqual(result.indicators, []);
});

test('rejects malformed classifier input using its Zod contract', () => {
  assert.throws(() => classifyFailure({ incidentType: 'DOCKER_SOCKET_ERROR', evidence: [] }));
});
