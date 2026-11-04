import { Router } from 'express';
import {
  getServiceController,
  listServicesController,
} from '../controllers/services-controller.js';

export const servicesRouter = Router();
servicesRouter.get('/', listServicesController);
servicesRouter.get('/:id', getServiceController);
