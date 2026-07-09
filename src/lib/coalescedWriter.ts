export interface CoalescedTimer {
  schedule: (callback: () => void, delayMs: number) => ReturnType<typeof setTimeout>;
  cancel: (handle: ReturnType<typeof setTimeout>) => void;
}

export interface CoalescedWriter<T> {
  schedule: (value: T) => void;
  flush: () => boolean;
  cancel: () => void;
  hasPending: () => boolean;
}

const defaultTimer: CoalescedTimer = {
  schedule: (callback, delayMs) => setTimeout(callback, delayMs),
  cancel: (handle) => clearTimeout(handle),
};

export const createCoalescedWriter = <T>(
  write: (value: T) => void,
  delayMs: number,
  timer: CoalescedTimer = defaultTimer,
): CoalescedWriter<T> => {
  let pendingValue: T;
  let pending = false;
  let timerHandle: ReturnType<typeof setTimeout> | undefined;

  const writePending = () => {
    if (!pending) {
      return false;
    }

    const value = pendingValue;
    pending = false;
    write(value);
    return true;
  };

  const flush = () => {
    if (timerHandle !== undefined) {
      timer.cancel(timerHandle);
      timerHandle = undefined;
    }
    return writePending();
  };

  const cancel = () => {
    if (timerHandle !== undefined) {
      timer.cancel(timerHandle);
      timerHandle = undefined;
    }
    pending = false;
  };

  return {
    schedule(value) {
      pendingValue = value;
      pending = true;
      if (timerHandle !== undefined) {
        return;
      }

      timerHandle = timer.schedule(() => {
        timerHandle = undefined;
        writePending();
      }, delayMs);
    },
    flush,
    cancel,
    hasPending: () => pending,
  };
};
