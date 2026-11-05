import type { RequestHandler } from 'express';
import { z } from 'zod';
import { getService, listServices } from '../../services/service-service.js';

const serviceIdParams = z.object({ id: z.string().regex(/^c[a-z0-9]{24}$/, 'Invalid service ID') });

export const listServicesController: RequestHandler = async (_req, res) => {
  res.status(200).json({ data: await listServices() });
};

export const getServiceController: RequestHandler = async (req, res) => {
  const { id } = serviceIdParams.parse(req.params);
  const service = await getService(id);
  if (!service) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Service not found' } });
    return;
  }
  res.status(200).json({ data: service });
};
