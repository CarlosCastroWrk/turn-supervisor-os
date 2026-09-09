import { useEffect, useState } from 'react';

// A clock React can see. `new Date()` inside a memo is frozen at first render,
// so "today" and "this pay week" counts stop rolling at midnight and at the
// Saturday-to-Sunday pay boundary until something else re-renders. This ticks
// once a minute and whenever the app comes back to the foreground.
export const useNow = (everyMs = 60_000): Date => {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const tick = () => setNow(new Date());
    const id = window.setInterval(tick, everyMs);
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [everyMs]);
  return now;
};
