import type { ContainerInspectInfo } from 'dockerode';
import { HealthStatus, ServiceStatus } from '../generated/prisma/client.js';
import { env } from '../config/env.js';
import { DetectionEngine, type FailureDetection, type FailureType } from '../detection/detection-engine.js';
import { docker } from './docker-client.js';
import { prisma } from '../lib/prisma.js';

function dockerStatusCode(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null || !('statusCode' in error)) return undefined;
  const statusCode = error.statusCode;
  return typeof statusCode === 'number' ? statusCode : undefined;
}

function mapObservation(container: ContainerInspectInfo): {
  status: ServiceStatus;
  healthStatus: HealthStatus;
} {
  const status = container.State.Running ? ServiceStatus.RUNNING : ServiceStatus.STOPPED;
  const dockerHealth = container.State.Health?.Status;
  let healthStatus: HealthStatus = HealthStatus.NOT_CONFIGURED;
  if (dockerHealth === 'healthy') healthStatus = HealthStatus.HEALTHY;
  else if (dockerHealth === 'unhealthy') healthStatus = HealthStatus.UNHEALTHY;
  else if (dockerHealth) healthStatus = HealthStatus.UNKNOWN;
  return { status, healthStatus };
}

function failureFor(
  serviceName: string,
  status: ServiceStatus,
  healthStatus: HealthStatus,
): FailureDetection | null {
  let failureType: FailureType | null = null;
  let description = '';
  if (status === ServiceStatus.STOPPED) {
    failureType = 'CONTAINER_STOPPED';
    description = `Configured container "${serviceName}" is stopped.`;
  } else if (healthStatus === HealthStatus.UNHEALTHY) {
    failureType = 'CONTAINER_UNHEALTHY';
    description = `Configured container "${serviceName}" reports an unhealthy state.`;
  }
  return failureType ? { serviceName, failureType, description } : null;
}

export class ContainerMonitor {
  private readonly detections = new DetectionEngine();
  private readonly monitoringErrors = new Map<string, number>();

  async pollOnce(): Promise<void> {
    for (const containerName of env.MONITORED_CONTAINERS) {
      await this.inspectConfiguredContainer(containerName);
    }
  }

  private async inspectConfiguredContainer(containerName: string): Promise<void> {
    const existingService = await prisma.service.findUnique({ where: { containerId: containerName } });
    if (existingService && !existingService.isEnabled) {
      this.logDetectionEvents(this.detections.observe(containerName, null));
      return;
    }

    let inspection: ContainerInspectInfo;
    try {
      inspection = await docker.getContainer(containerName).inspect();
    } catch (error) {
      if (dockerStatusCode(error) === 404) {
        const observation = { status: ServiceStatus.UNAVAILABLE, healthStatus: HealthStatus.UNKNOWN };
        const service = await prisma.service.upsert({
          where: { containerId: containerName },
          create: { name: containerName, containerId: containerName, ...observation, lastCheckedAt: new Date() },
          update: { ...observation, lastCheckedAt: new Date() },
        });
        this.logDetectionEvents(this.detections.observe(service.name, {
          serviceName: service.name,
          failureType: 'CONTAINER_UNAVAILABLE',
          description: `Configured container "${containerName}" was not found by Docker.`,
        }));
        return;
      }

      const count = (this.monitoringErrors.get(containerName) ?? 0) + 1;
      this.monitoringErrors.set(containerName, count);
      if (count === 1 || count % 12 === 0) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`Docker monitoring error for "${containerName}" (attempt ${count}); previous service state is unchanged: ${message}`);
      }
      return;
    }

    this.logRecoveredMonitoring(containerName);
    const observation = mapObservation(inspection);
    const service = await prisma.service.upsert({
      where: { containerId: containerName },
      create: {
        name: containerName,
        containerId: containerName,
        ...observation,
        lastCheckedAt: new Date(),
      },
      update: { ...observation, lastCheckedAt: new Date() },
    });
    const failure = failureFor(service.name, observation.status, observation.healthStatus);
    this.logDetectionEvents(this.detections.observe(service.name, failure));
  }

  private logRecoveredMonitoring(containerName: string): void {
    if (this.monitoringErrors.delete(containerName)) {
      console.info(`Docker monitoring recovered for "${containerName}"`);
    }
  }

  private logDetectionEvents(events: ReturnType<DetectionEngine['observe']>): void {
    for (const event of events) {
      if (event.kind === 'detected') {
        console.warn(`Failure detected (${event.detection.failureType}): ${event.detection.description}`);
      } else {
        console.info(`Failure condition cleared (${event.detection.failureType}) for "${event.detection.serviceName}".`);
      }
    }
  }
}
