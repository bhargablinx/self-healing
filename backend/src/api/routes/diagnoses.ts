import { Router } from 'express';
import { listDiagnosisHistoryController } from '../controllers/diagnosis-controller.js';

export const diagnosesRouter = Router();
diagnosesRouter.get('/', listDiagnosisHistoryController);
