-- Add diagnosis history without altering existing incidents or evidence.
CREATE TYPE "DiagnosisType" AS ENUM ('APPLICATION_CRASH', 'OUT_OF_MEMORY', 'HEALTH_CHECK_FAILURE', 'STARTUP_FAILURE', 'CONTAINER_UNAVAILABLE', 'UNKNOWN_FAILURE');

CREATE TYPE "DiagnosisConfidence" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'INCONCLUSIVE');

CREATE TYPE "DiagnosisMethod" AS ENUM ('RULE_BASED', 'LLM');

CREATE TABLE "diagnoses" (
    "id" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "diagnosisType" "DiagnosisType" NOT NULL,
    "probableCause" TEXT NOT NULL,
    "explanation" TEXT NOT NULL,
    "confidence" "DiagnosisConfidence" NOT NULL,
    "supportingEvidence" JSONB NOT NULL,
    "missingEvidence" JSONB NOT NULL,
    "diagnosisMethod" "DiagnosisMethod" NOT NULL DEFAULT 'RULE_BASED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "diagnoses_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "diagnoses_incidentId_createdAt_idx" ON "diagnoses"("incidentId", "createdAt");

CREATE INDEX "diagnoses_incidentId_diagnosisMethod_createdAt_idx" ON "diagnoses"("incidentId", "diagnosisMethod", "createdAt");

ALTER TABLE "diagnoses" ADD CONSTRAINT "diagnoses_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "incidents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
