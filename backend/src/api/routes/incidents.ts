import { Router } from 'express';
import {
  getIncidentController,
  listIncidentsController,
} from '../controllers/incidents-controller.js';
import {
  getIncidentEvidenceController,
  getLatestDiagnosisController,
  triggerDiagnosisController,
} from '../controllers/diagnosis-controller.js';

export const incidentsRouter = Router();
incidentsRouter.get('/:id/evidence', getIncidentEvidenceController);
incidentsRouter.get('/:id/diagnosis', getLatestDiagnosisController);
incidentsRouter.post('/:id/diagnose', triggerDiagnosisController);
incidentsRouter.get('/', listIncidentsController);
incidentsRouter.get('/:id', getIncidentController);
