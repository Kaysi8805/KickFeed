import { useEffect, useState } from 'react';

/** Re-render every 30s so live minutes stay honest without a backend. */
export function useLiveTick(ms = 30_000): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), ms);
    return () => clearInterval(id);
  }, [ms]);
  return tick;
}
