import { app } from './app.js';
import { env } from './config/env.js';
import { prisma } from './lib/prisma.js';
import { startMonitoringWorker } from './monitoring/worker.js';

const server = app.listen(env.PORT, () => console.info(`API listening on port ${env.PORT}`));
const stopMonitoring = startMonitoringWorker();
async function shutdown(signal: string): Promise<void> {
  console.info(`${signal} received; shutting down`);
  stopMonitoring();
  server.close(async () => { await prisma.$disconnect(); process.exit(0); });
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
