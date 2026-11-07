import { EvidenceCollectionStatus, Prisma } from '../generated/prisma/client.js';
import { prisma } from '../lib/prisma.js';

export type EvidenceRecord = {
  incidentId: string;
  evidenceType: 'CONTAINER_STATE' | 'CONTAINER_LOGS' | 'EXIT_CODE' | 'HEALTH_CHECK' | 'RESTART_COUNT' | 'CONTAINER_METADATA';
  content: Prisma.InputJsonValue;
  collectionStatus?: EvidenceCollectionStatus;
  collectionError?: string;
};

export async function saveEvidence(record: EvidenceRecord): Promise<void> {
  const collectionStatus = record.collectionStatus ?? EvidenceCollectionStatus.COMPLETE;
  await prisma.incidentEvidence.upsert({
    where: { incidentId_evidenceType: { incidentId: record.incidentId, evidenceType: record.evidenceType } },
    create: { ...record, collectionStatus },
    update: { content: record.content, collectedAt: new Date(), collectionStatus, collectionError: record.collectionError ?? null },
  });
}
