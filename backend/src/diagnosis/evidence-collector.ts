import type { ContainerInspectInfo } from 'dockerode';
import { EvidenceCollectionStatus, type Prisma } from '../generated/prisma/client.js';
import { env } from '../config/env.js';
import { saveEvidence, type EvidenceRecord } from './evidence-service.js';
import { docker } from '../monitoring/docker-client.js';

export interface EvidenceContext {
  incidentId: string;
  containerName: string;
  inspection?: ContainerInspectInfo;
  previousStatus: string;
  lastSuccessfulCheck: Date | null;
  detectedAt: Date;
}

const secretPatterns = [
  /(\b(?:authorization)\b\s*[:=]\s*Bearer\s+)[A-Za-z0-9._~+\/-]+=*/gi,
  /(\b(?:password|passwd|token|secret|api[_-]?key|authorization)\b\s*[:=]\s*)([^\s,;]+)/gi,
  /(Bearer\s+)[A-Za-z0-9._~+\/-]+=*/gi,
  /(https?:\/\/[^\s/:]+:)[^@\s]+(@)/gi,
];

export function sanitizeLog(value: string): string {
  const redacted = secretPatterns.reduce((text, pattern, index) => text.replace(pattern, index === 3 ? '$1[REDACTED]$2' : '$1[REDACTED]'), value);
  return redacted.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
}

function decodeDockerLogs(buffer: Buffer): { stdout: string; stderr: string } {
  let offset = 0;
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  let framed = buffer.length >= 8;
  while (framed && offset < buffer.length) {
    if (offset + 8 > buffer.length || buffer[offset + 1] !== 0 || buffer[offset + 2] !== 0 || buffer[offset + 3] !== 0) {
      framed = false;
      break;
    }
    const streamType = buffer[offset];
    const length = buffer.readUInt32BE(offset + 4);
    if ((streamType !== 1 && streamType !== 2) || offset + 8 + length > buffer.length) {
      framed = false;
      break;
    }
    const payload = buffer.subarray(offset + 8, offset + 8 + length);
    (streamType === 1 ? stdout : stderr).push(payload);
    offset += 8 + length;
  }
  if (framed && offset === buffer.length) {
    return { stdout: Buffer.concat(stdout).toString('utf8'), stderr: Buffer.concat(stderr).toString('utf8') };
  }
  return { stdout: buffer.toString('utf8'), stderr: '' };
}

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function dockerError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return sanitizeLog(raw).slice(0, 500);
}

async function persist(record: EvidenceRecord): Promise<void> {
  try {
    await saveEvidence(record);
  } catch (error) {
    console.error(`Could not persist ${record.evidenceType} evidence for incident ${record.incidentId}: ${dockerError(error)}`);
  }
}

async function collect(context: EvidenceContext): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.EVIDENCE_COLLECTION_TIMEOUT_MS);
  try {
    let inspection = context.inspection;
    let inspectionError: unknown;
    if (!inspection) {
      try {
        inspection = await docker.getContainer(context.containerName).inspect({ abortSignal: controller.signal });
      } catch (error) {
        inspectionError = error;
      }
    }

    if (inspection) {
      const state = inspection.State;
      const common = {
        containerId: inspection.Id,
        containerName: inspection.Name.replace(/^\//, ''),
        serviceName: context.containerName,
        previousServiceStatus: context.previousStatus,
        lastSuccessfulMonitoringAt: context.lastSuccessfulCheck?.toISOString() ?? null,
        incidentDetectedAt: context.detectedAt.toISOString(),
      };
      const records: EvidenceRecord[] = [
        { incidentId: context.incidentId, evidenceType: 'CONTAINER_STATE', content: json({ ...common, state: state.Status, running: state.Running, error: sanitizeLog(state.Error ?? '') || null }) },
        { incidentId: context.incidentId, evidenceType: 'EXIT_CODE', content: json({ exitCode: state.ExitCode, oomKilled: state.OOMKilled, finishedAt: state.FinishedAt || null }) },
        { incidentId: context.incidentId, evidenceType: 'RESTART_COUNT', content: json({ restartCount: inspection.RestartCount }) },
        { incidentId: context.incidentId, evidenceType: 'CONTAINER_METADATA', content: json({ image: inspection.Config?.Image ?? null, startedAt: state.StartedAt || null }) },
        { incidentId: context.incidentId, evidenceType: 'HEALTH_CHECK', content: json({ status: state.Health?.Status ?? 'not_configured', failingStreak: state.Health?.FailingStreak ?? 0, recentChecks: (state.Health?.Log ?? []).slice(-5).map((entry) => ({ exitCode: entry.ExitCode, output: sanitizeLog(entry.Output ?? '').slice(0, 2_000), startedAt: entry.Start, finishedAt: entry.End })) }) },
      ];
      for (const record of records) await persist(record);
    } else {
      const message = dockerError(inspectionError ?? new Error('Container inspection unavailable'));
      for (const evidenceType of ['CONTAINER_STATE', 'EXIT_CODE', 'RESTART_COUNT', 'CONTAINER_METADATA', 'HEALTH_CHECK'] as const) {
        await persist({
          incidentId: context.incidentId,
          evidenceType,
          content: json({ serviceName: context.containerName, previousServiceStatus: context.previousStatus }),
          collectionStatus: EvidenceCollectionStatus.FAILED,
          collectionError: message,
        });
      }
    }

    try {
      const raw = await docker.getContainer(context.containerName).logs({
        stdout: true, stderr: true, tail: env.EVIDENCE_LOG_TAIL_LINES, timestamps: true, abortSignal: controller.signal,
      });
      const decoded = decodeDockerLogs(raw);
      const stdout = sanitizeLog(decoded.stdout).split(/\r?\n/).slice(-env.EVIDENCE_LOG_TAIL_LINES).join('\n');
      const stderr = sanitizeLog(decoded.stderr).split(/\r?\n/).slice(-env.EVIDENCE_LOG_TAIL_LINES).join('\n');
      const combined = `${stdout}\n${stderr}`;
      const truncated = Buffer.byteLength(combined) > env.EVIDENCE_LOG_MAX_BYTES;
      const perStreamLimit = Math.floor(env.EVIDENCE_LOG_MAX_BYTES / 2);
      const clip = (text: string) => Buffer.from(text, 'utf8').subarray(-perStreamLimit).toString('utf8').replace(/\uFFFD/g, '');
      await persist({ incidentId: context.incidentId, evidenceType: 'CONTAINER_LOGS', content: json({ stdout: clip(stdout), stderr: clip(stderr), truncated, collectedAt: new Date().toISOString() }) });
    } catch (error) {
      await persist({ incidentId: context.incidentId, evidenceType: 'CONTAINER_LOGS', content: json({ logs: null }), collectionStatus: EvidenceCollectionStatus.FAILED, collectionError: dockerError(error) });
    }
  } finally {
    clearTimeout(timeout);
  }
}

export function collectIncidentEvidence(context: EvidenceContext): void {
  void collect(context).catch((error) => {
    console.error(`Evidence collection failed for incident ${context.incidentId}: ${dockerError(error)}`);
  });
}
