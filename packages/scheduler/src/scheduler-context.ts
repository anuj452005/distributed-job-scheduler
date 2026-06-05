export interface SchedulerContext {
  retryTimer: ReturnType<typeof setInterval> | null;
  sweeperTimer: ReturnType<typeof setInterval> | null;
  cronTimer: ReturnType<typeof setInterval> | null;
  isRunning: boolean;
}

export const schedulerContext: SchedulerContext = {
  retryTimer: null,
  sweeperTimer: null,
  cronTimer: null,
  isRunning: false,
};
