import {
  IncidentSeverity,
  IncidentStatus,
  IncidentType,
  Prisma,
} from '../generated/prisma/client.js';
import { prisma } from '../lib/prisma.js';

export interface FailureToRecord {
  incidentType: IncidentType;
  description: string;
}

type IncidentTransaction = Pick<Prisma.TransactionClient, 'incident'>;

function severityFor(type: IncidentType): IncidentSeverity {
  return type === IncidentType.CONTAINER_UNAVAILABLE
    ? IncidentSeverity.MEDIUM
    : IncidentSeverity.HIGH;
}

/** Resolve obsolete active incidents and create/reuse the current one atomically. */
export async function reconcileServiceIncident(
  serviceId: string,
  failure: FailureToRecord | null,
) {
  return prisma.$transaction(
    (transaction) => reconcileServiceIncidentInTransaction(transaction, serviceId, failure),
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

/** Transaction-level reconciliation is exported so lifecycle rules can be tested without a database. */
export async function reconcileServiceIncidentInTransaction(
  transaction: IncidentTransaction,
  serviceId: string,
  failure: FailureToRecord | null,
) {
  const resolvedAt = new Date();
  const resolveFilter = failure
    ? { incidentType: { not: failure.incidentType } }
    : {};

  await transaction.incident.updateMany({
    where: {
      serviceId,
      status: IncidentStatus.ACTIVE,
      ...resolveFilter,
    },
    data: {
      status: IncidentStatus.RESOLVED,
      resolvedAt,
      deduplicationKey: null,
    },
  });

  if (!failure) return null;

  const deduplicationKey = `${serviceId}:${failure.incidentType}`;
  return transaction.incident.upsert({
    where: { deduplicationKey },
    create: {
      serviceId,
      incidentType: failure.incidentType,
      severity: severityFor(failure.incidentType),
      description: failure.description,
      deduplicationKey,
    },
    update: {},
  });
}

export async function listIncidents(input: {
  page: number;
  limit: number;
  status?: IncidentStatus;
}) {
  const where = input.status ? { status: input.status } : {};
  const [items, total] = await prisma.$transaction([
    prisma.incident.findMany({
      where,
      select: {
        id: true,
        serviceId: true,
        incidentType: true,
        severity: true,
        description: true,
        status: true,
        detectedAt: true,
        resolvedAt: true,
        createdAt: true,
        service: true,
      },
      orderBy: [{ detectedAt: 'desc' }, { id: 'desc' }],
      skip: (input.page - 1) * input.limit,
      take: input.limit,
    }),
    prisma.incident.count({ where }),
  ]);
  return { items, total };
}

export function getIncident(id: string) {
  return prisma.incident.findUnique({
    where: { id },
    select: {
      id: true,
      serviceId: true,
      incidentType: true,
      severity: true,
      description: true,
      status: true,
      detectedAt: true,
      resolvedAt: true,
      createdAt: true,
      service: true,
    },
  });
}
