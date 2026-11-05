import express, { type ErrorRequestHandler } from 'express';
import { Prisma } from './generated/prisma/client.js';
import { ZodError } from 'zod';
import { servicesRouter } from './api/routes/services.js';
import { incidentsRouter } from './api/routes/incidents.js';
import { env } from './config/env.js';

export const app = express();
app.disable('x-powered-by');
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && env.CORS_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }
  if (req.method === 'OPTIONS') {
    res.sendStatus(origin && env.CORS_ORIGINS.includes(origin) ? 204 : 403);
    return;
  }
  next();
});
app.use(express.json());
app.get('/api/health', (_req, res) => {
  res.status(200).json({ data: { status: 'ok' } });
});
app.use('/api/services', servicesRouter);
app.use('/api/incidents', incidentsRouter);
app.use((_req, res) => {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found' } });
});
const errorHandler: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
  if (error instanceof ZodError) {
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Request validation failed', details: error.issues } });
    return;
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError) console.error('Database request failed:', error.code);
  else console.error('Unhandled request error:', error);
  res.status(500).json({ error: { code: 'INTERNAL_SERVER_ERROR', message: 'An unexpected error occurred' } });
};
app.use(errorHandler);
