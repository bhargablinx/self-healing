import type { RequestHandler } from 'express';
import { IncidentStatus } from '../../generated/prisma/client.js';
import { z } from 'zod';
import { getIncident, listIncidents } from '../../incidents/incident-service.js';

const incidentIdParams = z.object({ id: z.string().min(1).max(64) });
const incidentListQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum([IncidentStatus.ACTIVE, IncidentStatus.RESOLVED]).optional(),
});

export const listIncidentsController: RequestHandler = async (req, res) => {
  const query = incidentListQuery.parse(req.query);
  const { items, total } = await listIncidents(query);
  res.status(200).json({
    data: items,
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      pages: Math.ceil(total / query.limit),
    },
  });
};

export const getIncidentController: RequestHandler = async (req, res) => {
  const { id } = incidentIdParams.parse(req.params);
  const incident = await getIncident(id);
  if (!incident) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Incident not found' } });
    return;
  }
  res.status(200).json({ data: incident });
};
