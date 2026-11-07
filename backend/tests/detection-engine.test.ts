import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DetectionEngine, type FailureDetection } from '../src/detection/detection-engine.js';

const stoppedFailure: FailureDetection = {
  serviceName: 'test-service',
  failureType: 'CONTAINER_STOPPED',
  description: 'Container stopped',
};

test('emits one detection for a continuing failure and clears it on recovery', () => {
  const engine = new DetectionEngine();

  assert.deepEqual(engine.observe('test-service', stoppedFailure), [
    { kind: 'detected', detection: stoppedFailure },
  ]);
  assert.deepEqual(engine.observe('test-service', stoppedFailure), []);
  assert.deepEqual(engine.observe('test-service', null), [
    { kind: 'cleared', detection: stoppedFailure },
  ]);
});

test('clears the previous failure before reporting a changed failure type', () => {
  const engine = new DetectionEngine();
  const unhealthyFailure: FailureDetection = {
    serviceName: 'test-service',
    failureType: 'CONTAINER_UNHEALTHY',
    description: 'Container unhealthy',
  };
  engine.observe('test-service', stoppedFailure);

  assert.deepEqual(engine.observe('test-service', unhealthyFailure), [
    { kind: 'cleared', detection: stoppedFailure },
    { kind: 'detected', detection: unhealthyFailure },
  ]);
});
