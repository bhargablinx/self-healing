import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  MONITORED_CONTAINERS: z.string().default('').transform((value) =>
    [...new Set(value.split(',').map((name) => name.trim()).filter(Boolean))],
  ),
  MONITOR_INTERVAL_MS: z.coerce.number().int().min(1_000).default(5_000),
  DOCKER_SOCKET_PATH: z.string().default('/var/run/docker.sock'),
  CORS_ORIGINS: z.string().default('http://localhost:5173,http://127.0.0.1:5173').transform((value) =>
    [...new Set(value.split(',').map((origin) => origin.trim()).filter(Boolean))],
  ),
});
const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}
export const env = parsed.data;
