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

export type CoalescedWriteState = 'pending' | 'saved' | 'failed';

const defaultTimer: CoalescedTimer = {
  schedule: (callback, delayMs) => setTimeout(callback, delayMs),
  cancel: (handle) => clearTimeout(handle),
};

export const createCoalescedWriter = <T>(
  write: (value: T) => boolean,
  delayMs: number,
  timer: CoalescedTimer = defaultTimer,
  onStateChange?: (state: CoalescedWriteState) => void,
): CoalescedWriter<T> => {
  let pendingValue: T;
  let pending = false;
  let lastWriteFailed = false;
  let timerHandle: ReturnType<typeof setTimeout> | undefined;

  const writePending = () => {
    if (!pending) {
      return false;
    }

    const value = pendingValue;
    const saved = write(value);
    if (saved) {
      pending = false;
      lastWriteFailed = false;
      onStateChange?.('saved');
      return true;
    }

    lastWriteFailed = true;
    onStateChange?.('failed');
    return false;
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
    lastWriteFailed = false;
  };

  return {
    schedule(value) {
      pendingValue = value;
      pending = true;
      if (!lastWriteFailed) {
        onStateChange?.('pending');
      }
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
