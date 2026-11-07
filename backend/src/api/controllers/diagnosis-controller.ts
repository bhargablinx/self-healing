import type { RequestHandler } from 'express';
import { z } from 'zod';
import {
  DiagnosisConfidence,
  DiagnosisMethod,
  DiagnosisType,
} from '../../generated/prisma/client.js';
import { diagnosisApiService } from '../../diagnosis/diagnosis-api-service.js';

const incidentParams = z.object({ id: z.string().regex(/^c[a-z0-9]{24}$/, 'Invalid incident ID') });
const historyQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  incidentId: z.string().regex(/^c[a-z0-9]{24}$/, 'Invalid incident ID').optional(),
  diagnosisType: z.nativeEnum(DiagnosisType).optional(),
  diagnosisMethod: z.nativeEnum(DiagnosisMethod).optional(),
  confidence: z.nativeEnum(DiagnosisConfidence).optional(),
});

export const getIncidentEvidenceController: RequestHandler = async (req, res) => {
  const { id } = incidentParams.parse(req.params);
  const evidence = await diagnosisApiService.getEvidence(id);
  res.status(200).json({ data: evidence });
};

export const getLatestDiagnosisController: RequestHandler = async (req, res) => {
  const { id } = incidentParams.parse(req.params);
  const diagnosis = await diagnosisApiService.getLatestDiagnosis(id);
  res.status(200).json({ data: diagnosis });
};

export const triggerDiagnosisController: RequestHandler = async (req, res) => {
  const { id } = incidentParams.parse(req.params);
  const result = await diagnosisApiService.triggerDiagnosis(id);
  res.status(result.reusedInFlight ? 200 : 201).json({
    data: result.diagnosis,
    meta: { reusedInFlight: result.reusedInFlight },
  });
};

export const listDiagnosisHistoryController: RequestHandler = async (req, res) => {
  const query = historyQuerySchema.parse(req.query);
  const { items, total } = await diagnosisApiService.listDiagnosisHistory(query);
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
