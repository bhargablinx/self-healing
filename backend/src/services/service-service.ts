import { prisma } from '../lib/prisma.js';

export function listServices() {
  return prisma.service.findMany({ orderBy: { name: 'asc' } });
}

export function getService(id: string) {
  return prisma.service.findUnique({ where: { id } });
}
