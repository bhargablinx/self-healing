-- CreateEnum
CREATE TYPE "ServiceStatus" AS ENUM ('UNKNOWN', 'RUNNING', 'STOPPED', 'UNAVAILABLE');

-- CreateEnum
CREATE TYPE "HealthStatus" AS ENUM ('UNKNOWN', 'HEALTHY', 'UNHEALTHY', 'NOT_CONFIGURED');

-- CreateEnum
CREATE TYPE "IncidentType" AS ENUM ('CONTAINER_STOPPED', 'CONTAINER_UNHEALTHY', 'CONTAINER_UNAVAILABLE');

-- CreateEnum
CREATE TYPE "IncidentSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "IncidentStatus" AS ENUM ('ACTIVE', 'RESOLVED');

-- CreateTable
CREATE TABLE "services" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "containerId" TEXT NOT NULL,
    "status" "ServiceStatus" NOT NULL DEFAULT 'UNKNOWN',
    "healthStatus" "HealthStatus" NOT NULL DEFAULT 'UNKNOWN',
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "lastCheckedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incidents" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "incidentType" "IncidentType" NOT NULL,
    "severity" "IncidentSeverity" NOT NULL DEFAULT 'MEDIUM',
    "description" TEXT NOT NULL,
    "status" "IncidentStatus" NOT NULL DEFAULT 'ACTIVE',
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "incidents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "services_containerId_key" ON "services"("containerId");

-- CreateIndex
CREATE INDEX "services_isEnabled_status_idx" ON "services"("isEnabled", "status");

-- CreateIndex
CREATE INDEX "incidents_serviceId_incidentType_status_idx" ON "incidents"("serviceId", "incidentType", "status");

-- CreateIndex
CREATE INDEX "incidents_status_detectedAt_idx" ON "incidents"("status", "detectedAt");

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE CASCADE;
