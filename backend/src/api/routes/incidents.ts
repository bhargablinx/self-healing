import { Router } from 'express';
import {
  getIncidentController,
  listIncidentsController,
} from '../controllers/incidents-controller.js';

export const incidentsRouter = Router();
incidentsRouter.get('/', listIncidentsController);
incidentsRouter.get('/:id', getIncidentController);
