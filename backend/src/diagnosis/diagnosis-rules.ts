import { z } from 'zod';
import {
  FailureClassificationInputSchema,
  type FailureClassificationInput,
  classifyFailure,
} from './failure-classifier.js';

export const DiagnosisConfidenceSchema = z.enum(['LOW', 'MEDIUM', 'HIGH', 'INCONCLUSIVE']);
export const DiagnosisMethodSchema = z.literal('RULE_BASED');

export const DiagnosisResultSchema = z.object({
  diagnosisType: z.enum([
    'APPLICATION_CRASH', 'OUT_OF_MEMORY', 'HEALTH_CHECK_FAILURE', 'STARTUP_FAILURE', 'CONTAINER_UNAVAILABLE', 'UNKNOWN_FAILURE',
  ]),
  probableCause: z.string().min(1),
  explanation: z.string().min(1),
  confidence: DiagnosisConfidenceSchema,
  supportingEvidence: z.array(z.string()),
  missingEvidence: z.array(z.string()),
  diagnosisMethod: DiagnosisMethodSchema,
});

export const DiagnosisInputSchema = FailureClassificationInputSchema.extend({
  incidentDescription: z.string().optional(),
});

export type DiagnosisInput = z.infer<typeof DiagnosisInputSchema>;
export type DiagnosisResult = z.infer<typeof DiagnosisResultSchema>;
type EvidenceMap = Partial<Record<FailureClassificationInput['evidence'][number]['evidenceType'], Record<string, unknown>>>;

function objectContent(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function logsText(logs: Record<string, unknown> | undefined): string {
  return logs ? [logs.stdout, logs.stderr].filter((value): value is string => typeof value === 'string').join('\n') : '';
}

function hasErrorText(logs: string): boolean {
  return /\b(error|fatal|exception|uncaught|traceback|panic)\b/i.test(logs);
}

function failedHealthCount(health: Record<string, unknown> | undefined): number {
  if (!health) return 0;
  const streak = numberValue(health.failingStreak) ?? 0;
  const failedRecentChecks = Array.isArray(health.recentChecks)
    ? health.recentChecks.filter((entry) => {
      const check = objectContent(entry);
      return check !== undefined && numberValue(check.exitCode) !== undefined && check.exitCode !== 0;
    }).length
    : 0;
  return Math.max(streak, failedRecentChecks);
}

function makeResult(
  diagnosisType: DiagnosisResult['diagnosisType'],
  probableCause: string,
  explanation: string,
  confidence: DiagnosisResult['confidence'],
  supportingEvidence: string[],
  missingEvidence: string[],
): DiagnosisResult {
  return DiagnosisResultSchema.parse({
    diagnosisType, probableCause, explanation, confidence, supportingEvidence, missingEvidence, diagnosisMethod: 'RULE_BASED',
  });
}

type Rule = (input: DiagnosisInput, evidence: EvidenceMap) => DiagnosisResult | null;

const outOfMemoryRule: Rule = (_input, evidence) => {
  if (evidence.EXIT_CODE?.oomKilled !== true) return null;
  return makeResult(
    'OUT_OF_MEMORY',
    'The container was terminated after an out-of-memory event.',
    'Docker explicitly marked this container as OOMKilled. This is strong evidence that memory exhaustion caused the termination.',
    'HIGH',
    ['Docker reported OOMKilled=true.'],
    ['Container memory usage leading up to termination.'],
  );
};

const startupFailureRule: Rule = (_input, evidence) => {
  const state = evidence.CONTAINER_STATE;
  const exitCode = numberValue(evidence.EXIT_CODE?.exitCode);
  const logs = logsText(evidence.CONTAINER_LOGS);
  const startupText = /\b(startup|starting|boot(?:ing)?|initiali[sz](?:e|ing|ation)|failed to start|listen(?:ing)? on|bind(?:ing)?)\b/i.test(logs);
  const errorText = hasErrorText(logs) || /\b(cannot|unable|failed|failure)\b/i.test(logs);
  const healthFailures = failedHealthCount(evidence.HEALTH_CHECK);
  const startedAt = Date.parse(String(evidence.CONTAINER_METADATA?.startedAt ?? ''));
  const finishedAt = Date.parse(String(evidence.EXIT_CODE?.finishedAt ?? ''));
  const runtimeMs = finishedAt - startedAt;
  const exitedQuickly = Number.isFinite(runtimeMs) && runtimeMs >= 0 && runtimeMs <= 5 * 60 * 1_000;
  const isStopped = state?.running === false || state?.state === 'exited';
  if (!isStopped || exitCode === undefined || exitCode === 0 || !startupText || !errorText || healthFailures < 1 || !exitedQuickly) return null;
  return makeResult(
    'STARTUP_FAILURE',
    'The application failed during startup.',
    'The container exited within five minutes of starting. Collected logs contain a startup-related error and Docker health evidence records a failed check.',
    'MEDIUM',
    [`Container exited with code ${exitCode}.`, 'Startup-related error text was found in collected logs.', 'Docker recorded a failed health check.'],
    ['Detailed startup trace or dependency-specific error context.'],
  );
};

const healthCheckRule: Rule = (input, evidence) => {
  const state = evidence.CONTAINER_STATE;
  const health = evidence.HEALTH_CHECK;
  const running = state?.running === true || state?.state === 'running';
  const failures = failedHealthCount(health);
  if (input.incidentType !== 'CONTAINER_UNHEALTHY' || !running || health?.status !== 'unhealthy' || failures < 2) return null;
  const recentOutput = Array.isArray(health.recentChecks)
    ? health.recentChecks
      .map(objectContent)
      .filter((check): check is Record<string, unknown> => check !== undefined)
      .map((check) => check.output)
      .find((output): output is string => typeof output === 'string' && output.trim().length > 0)
    : undefined;
  return makeResult(
    'HEALTH_CHECK_FAILURE',
    'The running application repeatedly failed its Docker health checks.',
    'Docker reports the container is running but unhealthy, with repeated failed health-check results. This does not by itself identify which application dependency or endpoint is responsible.',
    failures >= 3 ? 'HIGH' : 'MEDIUM',
    ['Container is running.', 'Docker health status is unhealthy.', `Docker recorded at least ${failures} failed health checks.`, ...(recentOutput ? ['Recent health-check output is available.'] : [])],
    ['Application and dependency logs around the failed checks.'],
  );
};

const applicationCrashRule: Rule = (_input, evidence) => {
  const state = evidence.CONTAINER_STATE;
  const exitCode = numberValue(evidence.EXIT_CODE?.exitCode);
  const isStopped = state?.running === false || state?.state === 'exited';
  if (!isStopped || exitCode === undefined || exitCode === 0) return null;
  const hasLogs = evidence.CONTAINER_LOGS !== undefined;
  const errorFound = hasErrorText(logsText(evidence.CONTAINER_LOGS));
  return makeResult(
    'APPLICATION_CRASH',
    'The application process terminated unexpectedly.',
    errorFound
      ? `The container exited with code ${exitCode}, and recent logs contain error-related text. The specific root cause is not established.`
      : `The container exited with code ${exitCode}. An exit code alone does not identify the root cause.`,
    errorFound ? 'MEDIUM' : 'LOW',
    [`Container exited with code ${exitCode}.`, ...(errorFound ? ['Recent container logs contain error-related text.'] : [])],
    [...(!hasLogs ? ['Recent container logs.'] : []), 'Detailed application trace and relevant dependency status.'],
  );
};

const unavailableRule: Rule = (input) => {
  if (input.incidentType !== 'CONTAINER_UNAVAILABLE') return null;
  return makeResult(
    'CONTAINER_UNAVAILABLE',
    'The configured container is unavailable or may have been removed.',
    'Docker returned a confirmed not-found response for this configured container. The available evidence cannot determine whether the removal was intentional or caused by a deployment/configuration change.',
    'MEDIUM',
    ['The incident was recorded after Docker confirmed that the configured container was not found.'],
    ['Operator intent and recent deployment/configuration history.'],
  );
};

const rules: Rule[] = [outOfMemoryRule, startupFailureRule, healthCheckRule, applicationCrashRule, unavailableRule];

function unknownRule(input: DiagnosisInput, evidence: EvidenceMap): DiagnosisResult {
  const present = new Set(input.evidence.map((item) => item.evidenceType));
  const failed = new Set(input.evidence.filter((item) => item.collectionStatus === 'FAILED').map((item) => item.evidenceType));
  const missingEvidence = (['CONTAINER_STATE', 'EXIT_CODE', 'HEALTH_CHECK', 'CONTAINER_LOGS'] as const)
    .filter((type) => !evidence[type])
    .map((type) => failed.has(type) ? `${type} evidence collection failed.` : present.has(type) ? `${type} evidence was unusable.` : `No ${type} evidence was collected.`);
  if (missingEvidence.length === 0) missingEvidence.push('More detailed application and dependency logs around the incident.');
  return makeResult(
    'UNKNOWN_FAILURE',
    'Insufficient evidence to identify a probable cause.',
    'The available evidence does not satisfy any specific diagnosis rule. Gather the missing container, exit, health-check, and log details before drawing a more specific conclusion.',
    'INCONCLUSIVE',
    [],
    missingEvidence,
  );
}

/** Runs independent deterministic rules in priority order and returns the first supported diagnosis. */
export function evaluateDiagnosis(rawInput: unknown): DiagnosisResult {
  const input = DiagnosisInputSchema.parse(rawInput);
  const classification = classifyFailure(input);
  const evidence: EvidenceMap = {};
  for (const item of input.evidence) {
    if (item.collectionStatus === 'FAILED') continue;
    const content = objectContent(item.content);
    if (content) evidence[item.evidenceType] = content;
  }
  // Classification is an evidence-based cross-check; diagnosis rules still verify their full conditions.
  for (const rule of rules) {
    const result = rule(input, evidence);
    if (result && result.diagnosisType === classification.category) return DiagnosisResultSchema.parse(result);
  }
  return DiagnosisResultSchema.parse(unknownRule(input, evidence));
}
