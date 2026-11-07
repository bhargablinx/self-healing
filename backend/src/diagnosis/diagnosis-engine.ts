import { DiagnosisMethod, Prisma } from '../generated/prisma/client.js';
import { prisma } from '../lib/prisma.js';
import { evaluateDiagnosis, type DiagnosisInput, type DiagnosisResult } from './diagnosis-rules.js';

type DiagnosisIncident = {
  id: string;
  incidentType: DiagnosisInput['incidentType'];
  description: string;
  evidence: DiagnosisInput['evidence'];
};

type DiagnosisCreateData = DiagnosisResult & { incidentId: string };

export interface DiagnosisRepository {
  findIncidentById(incidentId: string): Promise<DiagnosisIncident | null>;
  createDiagnosis(data: DiagnosisCreateData): Promise<unknown>;
}

const prismaRepository: DiagnosisRepository = {
  findIncidentById: (id) => prisma.incident.findUnique({
    where: { id },
    select: {
      id: true,
      incidentType: true,
      description: true,
      evidence: {
        orderBy: [{ collectedAt: 'asc' }, { id: 'asc' }],
        select: { evidenceType: true, collectionStatus: true, content: true },
      },
    },
  }),
  createDiagnosis: (data) => prisma.diagnosis.create({
    data: {
      incidentId: data.incidentId,
      diagnosisType: data.diagnosisType,
      probableCause: data.probableCause,
      explanation: data.explanation,
      confidence: data.confidence,
      supportingEvidence: data.supportingEvidence as Prisma.InputJsonValue,
      missingEvidence: data.missingEvidence as Prisma.InputJsonValue,
      diagnosisMethod: DiagnosisMethod.RULE_BASED,
    },
  }),
};

export class IncidentNotFoundError extends Error {
  constructor(incidentId: string) {
    super(`Incident "${incidentId}" was not found.`);
    this.name = 'IncidentNotFoundError';
  }
}

/** Evaluates a persisted incident and appends a rule-based diagnosis history record. */
export async function diagnoseIncident(incidentId: string, repository: DiagnosisRepository = prismaRepository) {
  const incident = await repository.findIncidentById(incidentId);
  if (!incident) throw new IncidentNotFoundError(incidentId);

  const input: DiagnosisInput = {
    incidentType: incident.incidentType,
    incidentDescription: incident.description,
    evidence: incident.evidence.map((item) => ({
      evidenceType: item.evidenceType,
      collectionStatus: item.collectionStatus,
      content: item.content,
    })),
  };
  const result = evaluateDiagnosis(input);
  return repository.createDiagnosis({ ...result, incidentId: incident.id });
}
