import { DependencyList, useCallback, useEffect, useRef, useState } from 'react';
import { useLiveEvent } from '../context/LiveEventsContext';
import type { LiveEventType } from '../api/types';

interface QueryState<T> {
  data: T | undefined;
  error: Error | null;
  /** True only for the first load; background refreshes keep showing data. */
  loading: boolean;
  refreshing: boolean;
  updatedAt: Date | null;
  refetch: () => Promise<void>;
}

interface QueryOptions {
  /** Refetch (debounced) when any of these live events arrive. */
  liveOn?: LiveEventType[];
}

/**
 * Minimal data-fetching hook: tracks loading/error state, ignores stale
 * responses, and refreshes in the background on live events.
 */
export function useQuery<T>(fetcher: () => Promise<T>, deps: DependencyList, options: QueryOptions = {}): QueryState<T> {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const requestId = useRef(0);
  const hasData = useRef(false);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(fetcher, deps);

  const refetch = useCallback(async () => {
    const id = ++requestId.current;
    if (hasData.current) setRefreshing(true);
    else setLoading(true);
    try {
      const result = await run();
      if (id !== requestId.current) return;
      setData(result);
      setError(null);
      setUpdatedAt(new Date());
      hasData.current = true;
    } catch (err) {
      if (id !== requestId.current) return;
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      if (id === requestId.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [run]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  // Bursts of events (e.g. a vision audit touching many products) collapse
  // into a single refetch.
  const timer = useRef<number>();
  useLiveEvent(options.liveOn ?? [], () => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(refetch, 300);
  });
  useEffect(() => () => window.clearTimeout(timer.current), []);

  return { data, error, loading, refreshing, updatedAt, refetch };
}
