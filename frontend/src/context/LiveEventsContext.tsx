import { createContext, ReactNode, useContext, useEffect, useRef, useState } from 'react';
import { API_BASE } from '../api/client';
import type { LiveEvent, LiveEventType } from '../api/types';

type Listener = (event: LiveEvent) => void;
export type ConnectionState = 'connecting' | 'live' | 'offline';

interface LiveEventsContextType {
  status: ConnectionState;
  subscribe: (listener: Listener) => () => void;
}

const EVENT_TYPES: LiveEventType[] = [
  'stock.changed',
  'alert.created',
  'alert.updated',
  'audit.completed',
  'shelf.changed',
  'floorplan.changed',
];

const LiveEventsContext = createContext<LiveEventsContextType | undefined>(undefined);

/**
 * One EventSource per tab, shared by every page. The browser reconnects on
 * its own after drops; we surface the state so users know data is live.
 */
export const LiveEventsProvider = ({ children }: { children: ReactNode }) => {
  const [status, setStatus] = useState<ConnectionState>('connecting');
  const listeners = useRef(new Set<Listener>());

  useEffect(() => {
    const source = new EventSource(`${API_BASE}/api/events`);

    source.onopen = () => setStatus('live');
    source.onerror = () => setStatus(source.readyState === EventSource.CLOSED ? 'offline' : 'connecting');

    const dispatch = (e: MessageEvent) => {
      try {
        const event = JSON.parse(e.data) as LiveEvent;
        listeners.current.forEach((l) => l(event));
      } catch {
        // ignore malformed frames
      }
    };
    EVENT_TYPES.forEach((t) => source.addEventListener(t, dispatch));

    return () => source.close();
  }, []);

  const subscribe = (listener: Listener) => {
    listeners.current.add(listener);
    return () => {
      listeners.current.delete(listener);
    };
  };

  return <LiveEventsContext.Provider value={{ status, subscribe }}>{children}</LiveEventsContext.Provider>;
};

export const useLiveEvents = () => {
  const ctx = useContext(LiveEventsContext);
  if (!ctx) throw new Error('useLiveEvents must be used within LiveEventsProvider');
  return ctx;
};

/** Call `listener` for each live event whose type is in `types`. */
export const useLiveEvent = (types: LiveEventType[], listener: Listener) => {
  const { subscribe } = useLiveEvents();
  const latest = useRef(listener);
  latest.current = listener;
  const key = types.join(',');

  useEffect(
    () =>
      subscribe((event) => {
        if (key.split(',').includes(event.type)) latest.current(event);
      }),
    [subscribe, key]
  );
};
