import { env } from '../config/env.js';
import { ContainerMonitor } from './monitor.js';

export function startMonitoringWorker(): () => void {
  if (env.MONITORED_CONTAINERS.length === 0) {
    console.info('Container monitoring is disabled: MONITORED_CONTAINERS is empty.');
    return () => undefined;
  }

  const monitor = new ContainerMonitor();
  let stopped = false;
  let cycleRunning = false;

  const runCycle = async (): Promise<void> => {
    if (stopped || cycleRunning) return;
    cycleRunning = true;
    try {
      await monitor.pollOnce();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Monitoring cycle failed; the next cycle will retry: ${message}`);
    } finally {
      cycleRunning = false;
    }
  };

  console.info(
    `Monitoring ${env.MONITORED_CONTAINERS.length} configured container(s) every ${env.MONITOR_INTERVAL_MS}ms.`,
  );
  void runCycle();
  const interval = setInterval(() => void runCycle(), env.MONITOR_INTERVAL_MS);
  return () => {
    stopped = true;
    clearInterval(interval);
  };
}
