import type { ContainerInspectInfo } from 'dockerode';
import { HealthStatus, IncidentType, ServiceStatus, type Service } from '../generated/prisma/client.js';
import { env } from '../config/env.js';
import { DetectionEngine, type FailureDetection, type FailureType } from '../detection/detection-engine.js';
import { reconcileServiceIncident, type FailureToRecord } from '../incidents/incident-service.js';
import { docker } from './docker-client.js';
import { prisma } from '../lib/prisma.js';
import { collectIncidentEvidence, type EvidenceContext } from '../diagnosis/evidence-collector.js';

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

type MonitoredService = Pick<Service, 'id' | 'name' | 'isEnabled' | 'status' | 'lastCheckedAt'>;
type ServiceObservation = {
  status: ServiceStatus;
  healthStatus: HealthStatus;
  lastCheckedAt: Date;
};

interface MonitorDependencies {
  monitoredContainers: string[];
  inspectContainer: (containerName: string) => Promise<ContainerInspectInfo>;
  findService: (containerName: string) => Promise<MonitoredService | null>;
  upsertService: (containerName: string, observation: ServiceObservation) => Promise<MonitoredService>;
  reconcileIncident: typeof reconcileServiceIncident;
  collectEvidence: (context: EvidenceContext) => void;
}

export class ContainerMonitor {
  private readonly detections = new DetectionEngine();
  private readonly monitoringErrors = new Map<string, number>();
  private readonly dependencies: MonitorDependencies;

  constructor(dependencies: Partial<MonitorDependencies> = {}) {
    this.dependencies = {
      monitoredContainers: dependencies.monitoredContainers ?? env.MONITORED_CONTAINERS,
      inspectContainer: dependencies.inspectContainer ?? ((containerName) => docker.getContainer(containerName).inspect()),
      findService: dependencies.findService ?? ((containerName) =>
        prisma.service.findUnique({ where: { containerId: containerName } })
      ),
      upsertService: dependencies.upsertService ?? ((containerName, observation) =>
        prisma.service.upsert({
          where: { containerId: containerName },
          create: { name: containerName, containerId: containerName, ...observation },
          update: observation,
        })
      ),
      reconcileIncident: dependencies.reconcileIncident ?? reconcileServiceIncident,
      collectEvidence: dependencies.collectEvidence ?? collectIncidentEvidence,
    };
  }

  async pollOnce(): Promise<void> {
    for (const containerName of this.dependencies.monitoredContainers) {
      await this.inspectConfiguredContainer(containerName);
    }
  }

  private async inspectConfiguredContainer(containerName: string): Promise<void> {
    const existingService = await this.dependencies.findService(containerName);
    if (existingService && !existingService.isEnabled) {
      return;
    }

    let inspection: ContainerInspectInfo;
    try {
      inspection = await this.dependencies.inspectContainer(containerName);
    } catch (error) {
      if (dockerStatusCode(error) === 404) {
        const observation = { status: ServiceStatus.UNAVAILABLE, healthStatus: HealthStatus.UNKNOWN };
        const service = await this.dependencies.upsertService(containerName, {
          ...observation,
          lastCheckedAt: new Date(),
        });
        const failure: FailureDetection = {
          serviceName: service.name,
          failureType: 'CONTAINER_UNAVAILABLE',
          description: `Configured container "${containerName}" was not found by Docker.`,
        };
        const incident = await this.dependencies.reconcileIncident(service.id, {
          incidentType: IncidentType[failure.failureType],
          description: failure.description,
        });
        const events = this.detections.observe(service.name, failure);
        this.logDetectionEvents(events);
        if (incident && events.some((event) => event.kind === 'detected')) {
          this.dependencies.collectEvidence({
            incidentId: incident.id, containerName, previousStatus: existingService?.status ?? ServiceStatus.UNKNOWN,
            lastSuccessfulCheck: existingService?.lastCheckedAt ?? null, detectedAt: new Date(),
          });
        }
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
    const service = await this.dependencies.upsertService(containerName, {
      ...observation,
      lastCheckedAt: new Date(),
    });
    const failure = failureFor(service.name, observation.status, observation.healthStatus);
    const incident = await this.dependencies.reconcileIncident(service.id, failure ? {
      incidentType: IncidentType[failure.failureType],
      description: failure.description,
    } : null);
    const events = this.detections.observe(service.name, failure);
    this.logDetectionEvents(events);
    if (incident && events.some((event) => event.kind === 'detected')) {
      this.dependencies.collectEvidence({
        incidentId: incident.id, containerName, inspection, previousStatus: existingService?.status ?? ServiceStatus.UNKNOWN,
        lastSuccessfulCheck: existingService?.lastCheckedAt ?? null, detectedAt: new Date(),
      });
    }
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
