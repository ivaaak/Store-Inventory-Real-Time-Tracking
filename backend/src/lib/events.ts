// src/lib/events.ts
import { EventEmitter } from 'events';
import { Request, Response } from 'express';
import { logger } from '../utils/logger';

/**
 * Domain events pushed to dashboards over Server-Sent Events.
 * Payloads are intentionally small; clients refetch what they need.
 */
export type DomainEvent =
  | { type: 'stock.changed'; sku: string; stock: number; reason: 'restock' | 'sale' | 'return' | 'adjustment' }
  | { type: 'alert.created'; alertId: string; severity: string; alertType: string; shelfLabel: string }
  | { type: 'alert.updated'; alertId: string; status: string }
  | { type: 'audit.completed'; shelfLabel: string; itemsAudited: number }
  | { type: 'shelf.changed'; label: string }
  | { type: 'floorplan.changed' };

const bus = new EventEmitter();
bus.setMaxListeners(0); // one listener per connected dashboard

export function publish(event: DomainEvent): void {
  bus.emit('event', { ...event, at: new Date().toISOString() });
}

/**
 * GET /api/events
 * Long-lived SSE stream of domain events.
 */
export function eventStream(req: Request, res: Response): void {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no', // disable proxy buffering (nginx)
  });
  res.flushHeaders();
  res.write('retry: 5000\n\n');

  const send = (event: DomainEvent & { at: string }) => {
    res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
  };

  // Comment frames keep intermediaries from closing an idle connection.
  const heartbeat = setInterval(() => res.write(': ping\n\n'), 25_000);

  bus.on('event', send);
  logger.debug('SSE client connected', { clients: bus.listenerCount('event') });

  req.on('close', () => {
    clearInterval(heartbeat);
    bus.off('event', send);
  });
}
