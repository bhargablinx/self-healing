import Docker from 'dockerode';
import { env } from '../config/env.js';

/** One Docker client is shared by the monitoring worker. */
export const docker = new Docker({ socketPath: env.DOCKER_SOCKET_PATH });
