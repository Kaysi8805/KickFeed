import { useEffect, useState } from 'react';

import { football } from '@/services/football';
import type { FootballStatus } from '@/services/footballTypes';

/** Subscribe to live catalog hydration so screens re-render when cache fills. */
export function useFootballCatalog(): FootballStatus {
  const [status, setStatus] = useState<FootballStatus>(() => football.getStatus());

  useEffect(() => {
    setStatus(football.getStatus());
    const stop = football.subscribe(() => setStatus(football.getStatus()));
    void football.hydrate();
    return stop;
  }, []);

  return status;
}
