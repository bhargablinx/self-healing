-- Additive V2-A evidence storage. Existing services and incidents are unchanged.
CREATE TYPE "EvidenceType" AS ENUM ('CONTAINER_STATE', 'CONTAINER_LOGS', 'EXIT_CODE', 'HEALTH_CHECK', 'RESTART_COUNT', 'CONTAINER_METADATA');

CREATE TYPE "EvidenceCollectionStatus" AS ENUM ('COMPLETE', 'PARTIAL', 'FAILED');

CREATE TABLE "incident_evidence" (
    "id" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "evidenceType" "EvidenceType" NOT NULL,
    "content" JSONB NOT NULL,
    "collectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "collectionStatus" "EvidenceCollectionStatus" NOT NULL DEFAULT 'COMPLETE',
    "collectionError" TEXT,

    CONSTRAINT "incident_evidence_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "incident_evidence_incidentId_collectedAt_idx" ON "incident_evidence"("incidentId", "collectedAt");

CREATE UNIQUE INDEX "incident_evidence_incidentId_evidenceType_key" ON "incident_evidence"("incidentId", "evidenceType");

ALTER TABLE "incident_evidence" ADD CONSTRAINT "incident_evidence_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "incidents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
