import {
  DiagnosisConfidence,
  DiagnosisMethod,
  DiagnosisType,
  type Diagnosis,
  type IncidentEvidence,
} from '../generated/prisma/client.js';
import { prisma } from '../lib/prisma.js';
import { diagnoseIncident, IncidentNotFoundError } from './diagnosis-engine.js';

export type DiagnosisHistoryQuery = {
  page: number;
  limit: number;
  incidentId?: string;
  diagnosisType?: DiagnosisType;
  diagnosisMethod?: DiagnosisMethod;
  confidence?: DiagnosisConfidence;
};

export type IncidentEvidenceRecord = Pick<
  IncidentEvidence,
  'id' | 'incidentId' | 'evidenceType' | 'content' | 'collectedAt' | 'collectionStatus' | 'collectionError'
>;

export interface DiagnosisApiRepository {
  findIncidentEvidence(incidentId: string): Promise<IncidentEvidenceRecord[] | null>;
  incidentExists(incidentId: string): Promise<boolean>;
  findLatestDiagnosis(incidentId: string): Promise<Diagnosis | null>;
  listDiagnosisHistory(query: DiagnosisHistoryQuery): Promise<{ items: Diagnosis[]; total: number }>;
}

const prismaRepository: DiagnosisApiRepository = {
  async findIncidentEvidence(incidentId) {
    const incident = await prisma.incident.findUnique({
      where: { id: incidentId },
      select: {
        evidence: {
          orderBy: [{ collectedAt: 'asc' }, { id: 'asc' }],
          select: {
            id: true,
            incidentId: true,
            evidenceType: true,
            content: true,
            collectedAt: true,
            collectionStatus: true,
            collectionError: true,
          },
        },
      },
    });
    return incident?.evidence ?? null;
  },
  async incidentExists(incidentId) {
    return (await prisma.incident.findUnique({ where: { id: incidentId }, select: { id: true } })) !== null;
  },
  findLatestDiagnosis: (incidentId) => prisma.diagnosis.findFirst({
    where: { incidentId },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  }),
  async listDiagnosisHistory(query) {
    const where = {
      ...(query.incidentId ? { incidentId: query.incidentId } : {}),
      ...(query.diagnosisType ? { diagnosisType: query.diagnosisType } : {}),
      ...(query.diagnosisMethod ? { diagnosisMethod: query.diagnosisMethod } : {}),
      ...(query.confidence ? { confidence: query.confidence } : {}),
    };
    const [items, total] = await prisma.$transaction([
      prisma.diagnosis.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      prisma.diagnosis.count({ where }),
    ]);
    return { items, total };
  },
};

export function createDiagnosisApiService(
  repository: DiagnosisApiRepository = prismaRepository,
  runDiagnosis: (incidentId: string) => Promise<Diagnosis> = diagnoseIncident,
) {
  const runningByIncident = new Map<string, Promise<Diagnosis>>();

  return {
    async getEvidence(incidentId: string): Promise<IncidentEvidenceRecord[]> {
      const evidence = await repository.findIncidentEvidence(incidentId);
      if (evidence === null) throw new IncidentNotFoundError(incidentId);
      return evidence;
    },

    async getLatestDiagnosis(incidentId: string): Promise<Diagnosis | null> {
      if (!await repository.incidentExists(incidentId)) throw new IncidentNotFoundError(incidentId);
      return repository.findLatestDiagnosis(incidentId);
    },

    listDiagnosisHistory(query: DiagnosisHistoryQuery) {
      return repository.listDiagnosisHistory(query);
    },

    async triggerDiagnosis(incidentId: string): Promise<{ diagnosis: Diagnosis; reusedInFlight: boolean }> {
      const current = runningByIncident.get(incidentId);
      if (current) return { diagnosis: await current, reusedInFlight: true };

      const job = runDiagnosis(incidentId);
      runningByIncident.set(incidentId, job);
      try {
        return { diagnosis: await job, reusedInFlight: false };
      } finally {
        if (runningByIncident.get(incidentId) === job) runningByIncident.delete(incidentId);
      }
    },
  };
}

export const diagnosisApiService = createDiagnosisApiService();
