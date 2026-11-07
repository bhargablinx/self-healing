import assert from 'node:assert/strict';
import { test } from 'node:test';
import { IncidentStatus, IncidentType, type Prisma } from '../src/generated/prisma/client.js';
import type { FailureToRecord } from '../src/incidents/incident-service.js';

interface StoredIncident {
  id: string;
  serviceId: string;
  incidentType: IncidentType;
  status: IncidentStatus;
  resolvedAt: Date | null;
  deduplicationKey: string | null;
}

function createFakeTransaction(): { transaction: Prisma.TransactionClient; rows: StoredIncident[] } {
  const rows: StoredIncident[] = [];
  const incident = {
    updateMany: async (args: {
      where: {
        serviceId: string;
        status: IncidentStatus;
        incidentType?: { not: IncidentType };
      };
      data: {
        status: IncidentStatus;
        resolvedAt: Date;
        deduplicationKey: null;
      };
    }) => {
      let count = 0;
      for (const row of rows) {
        const matchesType = !args.where.incidentType || row.incidentType !== args.where.incidentType.not;
        if (row.serviceId !== args.where.serviceId || row.status !== args.where.status || !matchesType) continue;
        row.status = args.data.status;
        row.resolvedAt = args.data.resolvedAt;
        row.deduplicationKey = args.data.deduplicationKey;
        count += 1;
      }
      return { count };
    },
    upsert: async (args: {
      where: { deduplicationKey: string };
      create: {
        serviceId: string;
        incidentType: IncidentType;
        deduplicationKey: string;
      };
      update: Record<string, never>;
    }) => {
      const existing = rows.find((row) => row.deduplicationKey === args.where.deduplicationKey);
      if (existing) return existing;
      const created: StoredIncident = {
        id: `incident-${rows.length + 1}`,
        serviceId: args.create.serviceId,
        incidentType: args.create.incidentType,
        status: IncidentStatus.ACTIVE,
        resolvedAt: null,
        deduplicationKey: args.create.deduplicationKey,
      };
      rows.push(created);
      return created;
    },
  };

  return { transaction: { incident } as unknown as Prisma.TransactionClient, rows };
}

process.env.DATABASE_URL ??= 'postgresql://test:test@127.0.0.1:5432/self_healing_test';
const { reconcileServiceIncidentInTransaction } = await import('../src/incidents/incident-service.js');

const stopped: FailureToRecord = {
  incidentType: IncidentType.CONTAINER_STOPPED,
  description: 'Container stopped',
};

test('reuses the active incident key for repeated observations of the same failure', async () => {
  const { transaction, rows } = createFakeTransaction();

  await reconcileServiceIncidentInTransaction(transaction, 'service-1', stopped);
  await reconcileServiceIncidentInTransaction(transaction, 'service-1', stopped);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].status, IncidentStatus.ACTIVE);
  assert.equal(rows[0].deduplicationKey, 'service-1:CONTAINER_STOPPED');
});

test('resolves an incident and releases its deduplication key after recovery', async () => {
  const { transaction, rows } = createFakeTransaction();
  await reconcileServiceIncidentInTransaction(transaction, 'service-1', stopped);

  await reconcileServiceIncidentInTransaction(transaction, 'service-1', null);

  assert.equal(rows[0].status, IncidentStatus.RESOLVED);
  assert.ok(rows[0].resolvedAt instanceof Date);
  assert.equal(rows[0].deduplicationKey, null);
});

test('resolves a previous failure type before recording a changed failure', async () => {
  const { transaction, rows } = createFakeTransaction();
  await reconcileServiceIncidentInTransaction(transaction, 'service-1', stopped);
  await reconcileServiceIncidentInTransaction(transaction, 'service-1', {
    incidentType: IncidentType.CONTAINER_UNHEALTHY,
    description: 'Container unhealthy',
  });

  assert.equal(rows.length, 2);
  assert.equal(rows[0].status, IncidentStatus.RESOLVED);
  assert.equal(rows[0].deduplicationKey, null);
  assert.equal(rows[1].status, IncidentStatus.ACTIVE);
  assert.equal(rows[1].incidentType, IncidentType.CONTAINER_UNHEALTHY);
});
