-- AlterTable
ALTER TABLE "incidents" ADD COLUMN     "deduplicationKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "incidents_deduplicationKey_key" ON "incidents"("deduplicationKey");

