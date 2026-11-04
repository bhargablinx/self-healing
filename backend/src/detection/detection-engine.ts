export type FailureType =
  | 'CONTAINER_STOPPED'
  | 'CONTAINER_UNHEALTHY'
  | 'CONTAINER_UNAVAILABLE';

export interface FailureDetection {
  serviceName: string;
  failureType: FailureType;
  description: string;
}

export type DetectionEvent =
  | { kind: 'detected'; detection: FailureDetection }
  | { kind: 'cleared'; detection: FailureDetection };

/** Emits a detection only when a service enters a new failure condition. */
export class DetectionEngine {
  private readonly activeByService = new Map<string, FailureDetection>();

  observe(serviceName: string, current: FailureDetection | null): DetectionEvent[] {
    const previous = this.activeByService.get(serviceName);
    if (previous?.failureType === current?.failureType) return [];

    const events: DetectionEvent[] = [];
    if (previous) {
      this.activeByService.delete(serviceName);
      events.push({ kind: 'cleared', detection: previous });
    }
    if (current) {
      this.activeByService.set(serviceName, current);
      events.push({ kind: 'detected', detection: current });
    }
    return events;
  }
}
