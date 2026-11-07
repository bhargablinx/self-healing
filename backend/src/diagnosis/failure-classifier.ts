import { z } from 'zod';

export const FailureCategorySchema = z.enum([
  'APPLICATION_CRASH',
  'OUT_OF_MEMORY',
  'HEALTH_CHECK_FAILURE',
  'STARTUP_FAILURE',
  'CONTAINER_UNAVAILABLE',
  'UNKNOWN_FAILURE',
]);

export const ClassifierEvidenceSchema = z.object({
  evidenceType: z.enum([
    'CONTAINER_STATE', 'CONTAINER_LOGS', 'EXIT_CODE', 'HEALTH_CHECK', 'RESTART_COUNT', 'CONTAINER_METADATA',
  ]),
  collectionStatus: z.enum(['COMPLETE', 'PARTIAL', 'FAILED']),
  content: z.unknown(),
});

export const FailureClassificationInputSchema = z.object({
  incidentType: z.enum(['CONTAINER_STOPPED', 'CONTAINER_UNHEALTHY', 'CONTAINER_UNAVAILABLE']),
  evidence: z.array(ClassifierEvidenceSchema),
});

export const FailureClassificationSchema = z.object({
  category: FailureCategorySchema,
  explanation: z.string().min(1),
  indicators: z.array(z.string()),
});

export type FailureCategory = z.infer<typeof FailureCategorySchema>;
export type FailureClassificationInput = z.infer<typeof FailureClassificationInputSchema>;
export type FailureClassification = z.infer<typeof FailureClassificationSchema>;

type EvidenceMap = Partial<Record<FailureClassificationInput['evidence'][number]['evidenceType'], Record<string, unknown>>>;

function objectContent(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function numberValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function failedHealthCheck(health: Record<string, unknown> | undefined): boolean {
  if (!health) return false;
  if (numberValue(health.failingStreak) !== null && (health.failingStreak as number) > 0) return true;
  if (!Array.isArray(health.recentChecks)) return false;
  return health.recentChecks.some((entry) => {
    const check = objectContent(entry);
    return check !== null && numberValue(check.exitCode) !== null && (check.exitCode as number) !== 0;
  });
}

function logsFrom(logs: Record<string, unknown> | undefined): string {
  if (!logs) return '';
  return [logs.stdout, logs.stderr].filter((part): part is string => typeof part === 'string').join('\n');
}

function classification(category: FailureCategory, explanation: string, indicators: string[]): FailureClassification {
  return FailureClassificationSchema.parse({ category, explanation, indicators });
}

function classifyUnavailable(input: FailureClassificationInput): FailureClassification | null {
  if (input.incidentType !== 'CONTAINER_UNAVAILABLE') return null;
  return classification(
    'CONTAINER_UNAVAILABLE',
    'Docker confirmed that the configured container could not be found. This does not establish whether it was intentionally removed.',
    ['The incident was recorded after Docker returned a confirmed not-found response.'],
  );
}

function classifyOutOfMemory(evidence: EvidenceMap): FailureClassification | null {
  const exit = evidence.EXIT_CODE;
  if (exit?.oomKilled !== true) return null;
  return classification(
    'OUT_OF_MEMORY',
    'Docker marked the container as OOMKilled, which is direct evidence that the container was terminated after an out-of-memory event.',
    ['Docker reported OOMKilled=true.'],
  );
}

function classifyStartupFailure(evidence: EvidenceMap, logs: string): FailureClassification | null {
  const state = evidence.CONTAINER_STATE;
  const exitCode = numberValue(evidence.EXIT_CODE?.exitCode);
  const startupError = /\b(startup|starting|boot(?:ing)?|initiali[sz](?:e|ing|ation)|failed to start|listen(?:ing)? on|bind(?:ing)?)\b/i.test(logs)
    && /\b(error|failed|failure|fatal|exception|cannot|unable)\b/i.test(logs);
  const isStopped = state?.running === false || state?.state === 'exited';
  const healthFailed = failedHealthCheck(evidence.HEALTH_CHECK);
  const startedAt = Date.parse(String(evidence.CONTAINER_METADATA?.startedAt ?? ''));
  const finishedAt = Date.parse(String(evidence.EXIT_CODE?.finishedAt ?? ''));
  const runtimeMs = finishedAt - startedAt;
  const failedDuringStartup = Number.isFinite(runtimeMs) && runtimeMs >= 0 && runtimeMs <= 5 * 60 * 1_000;
  if (!isStopped || exitCode === null || exitCode === 0 || !startupError || !healthFailed || !failedDuringStartup) return null;
  return classification(
    'STARTUP_FAILURE',
    'The container exited shortly after launch, and the available startup logs and health-check evidence both show failures.',
    ['Container was stopped with a non-zero exit code.', 'Startup-related error text was found in collected logs.', 'Health-check evidence records a failure.'],
  );
}

function classifyHealthCheckFailure(input: FailureClassificationInput, evidence: EvidenceMap): FailureClassification | null {
  if (input.incidentType !== 'CONTAINER_UNHEALTHY') return null;
  const running = evidence.CONTAINER_STATE?.running === true || evidence.CONTAINER_STATE?.state === 'running';
  const health = evidence.HEALTH_CHECK;
  if (!running || health?.status !== 'unhealthy' || !failedHealthCheck(health)) return null;
  return classification(
    'HEALTH_CHECK_FAILURE',
    'Docker reports that the container is running but unhealthy, and its health-check evidence records failures.',
    ['Container is running.', 'Docker health status is unhealthy.', 'Health-check failure count or recent result indicates a failed check.'],
  );
}

function classifyApplicationCrash(evidence: EvidenceMap): FailureClassification | null {
  const state = evidence.CONTAINER_STATE;
  const exitCode = numberValue(evidence.EXIT_CODE?.exitCode);
  if (!(state?.running === false || state?.state === 'exited') || exitCode === null || exitCode === 0) return null;
  const logText = logsFrom(evidence.CONTAINER_LOGS);
  const hasError = /\b(error|fatal|exception|uncaught|traceback|panic)\b/i.test(logText);
  const indicators = [`Container exited with code ${exitCode}.`];
  if (hasError) indicators.push('Recent logs contain error-related text.');
  return classification(
    'APPLICATION_CRASH',
    hasError
      ? 'The container exited with a non-zero code and recent logs contain error-related text; the specific root cause is not established.'
      : 'The container exited with a non-zero code. The exit code alone does not identify the root cause.',
    indicators,
  );
}

/** Classifies a failure from successfully collected evidence without inferring unsupported root causes. */
export function classifyFailure(rawInput: unknown): FailureClassification {
  const input = FailureClassificationInputSchema.parse(rawInput);
  const evidence: EvidenceMap = {};
  for (const item of input.evidence) {
    if (item.collectionStatus === 'FAILED') continue;
    const content = objectContent(item.content);
    if (content) evidence[item.evidenceType] = content;
  }
  const logs = logsFrom(evidence.CONTAINER_LOGS);
  const result = classifyUnavailable(input)
    ?? classifyOutOfMemory(evidence)
    ?? classifyStartupFailure(evidence, logs)
    ?? classifyHealthCheckFailure(input, evidence)
    ?? classifyApplicationCrash(evidence)
    ?? classification(
      'UNKNOWN_FAILURE',
      'The available evidence does not support a more specific failure category. Additional container state, exit details, health-check results, and recent logs would help.',
      [],
    );
  return FailureClassificationSchema.parse(result);
}
