// src/webhooks/webhookHandler.ts
import { Request, Response } from 'express';
import crypto from 'crypto';
import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';
import { InventoryService } from '../services/inventoryService';
import { PosWebhookInput, PosWebhookSchema } from '../validation/schemas';

type OrderData = PosWebhookInput['data'];

/**
 * Handlers are static and passed to Express unbound, so they reference the
 * class by name rather than through `this`.
 */
export class WebhookHandler {
  /**
   * Verify the HMAC-SHA256 signature over the raw request bytes. Re-serialising
   * req.body would not reproduce the sender's bytes (key order, whitespace).
   */
  private static verifyPosSignature(req: Request): boolean {
    const secret = process.env.POS_WEBHOOK_SECRET;

    if (!secret) {
      if (process.env.NODE_ENV === 'production') {
        logger.error('POS_WEBHOOK_SECRET is not set; rejecting webhook');
        return false;
      }
      logger.warn('POS_WEBHOOK_SECRET not set, skipping signature verification (development only)');
      return true;
    }

    const signature = req.headers['x-pos-signature'];
    if (typeof signature !== 'string' || !req.rawBody) return false;

    const expected = crypto.createHmac('sha256', secret).update(req.rawBody).digest('hex');
    const given = signature.replace(/^sha256=/, '');

    return (
      given.length === expected.length &&
      crypto.timingSafeEqual(Buffer.from(given, 'utf8'), Buffer.from(expected, 'utf8'))
    );
  }

  /**
   * POST /api/webhooks/pos-sale
   * Registered in the POS admin panel.
   */
  static async handlePosSale(req: Request, res: Response): Promise<Response> {
    const correlationId = crypto.randomUUID();

    const webhookLog = await prisma.webhookLog.create({
      data: {
        source: 'POS',
        eventType: typeof req.body?.event_type === 'string' ? req.body.event_type : 'unknown',
        payload: req.rawBody?.toString('utf8') ?? JSON.stringify(req.body),
        signature: req.headers['x-pos-signature'] as string | undefined,
      },
    });

    const fail = async (status: number, error: string, details?: unknown) => {
      await prisma.webhookLog.update({
        where: { id: webhookLog.id },
        data: { error: details ? `${error}: ${JSON.stringify(details)}` : error },
      });
      logger.warn('Webhook rejected', { correlationId, status, error });
      return res.status(status).json({ error, correlationId });
    };

    if (!WebhookHandler.verifyPosSignature(req)) {
      return fail(401, 'Invalid signature');
    }

    await prisma.webhookLog.update({ where: { id: webhookLog.id }, data: { verified: true } });

    const parsed = PosWebhookSchema.safeParse(req.body);
    if (!parsed.success) {
      return fail(400, 'Invalid payload', parsed.error.errors);
    }

    const { event_type, data } = parsed.data;

    try {
      const lineErrors =
        event_type === 'order.completed'
          ? await WebhookHandler.processOrderCompleted(data, correlationId)
          : await WebhookHandler.processOrderReversed(data, event_type, correlationId);

      await prisma.webhookLog.update({
        where: { id: webhookLog.id },
        data: {
          processed: true,
          processedAt: new Date(),
          error: lineErrors.length ? lineErrors.join('; ') : null,
        },
      });

      logger.info('Webhook processed', { correlationId, eventType: event_type, lineErrors: lineErrors.length });
      return res.status(200).json({ status: 'ACK', correlationId, lineErrors });
    } catch (error: any) {
      // Unexpected failure (e.g. database down): return 5xx so the POS
      // retries. Line processing is idempotent per order line.
      await prisma.webhookLog
        .update({ where: { id: webhookLog.id }, data: { error: error.message } })
        .catch(() => undefined);
      logger.error('Webhook processing error', { correlationId, error: error.message, stack: error.stack });
      return res.status(500).json({ error: 'Internal processing error', correlationId });
    }
  }

  /**
   * Apply each line of a completed order. Returns non-retryable per-line
   * errors (e.g. unknown SKU) instead of failing the whole webhook.
   */
  private static async processOrderCompleted(data: OrderData, correlationId: string): Promise<string[]> {
    const errors: string[] = [];

    for (const item of data.line_items) {
      if (await InventoryService.hasProcessedOrderLine(data.order_id, item.sku)) {
        logger.info('Duplicate order line skipped', { orderId: data.order_id, sku: item.sku, correlationId });
        continue;
      }

      try {
        const product = await InventoryService.subtractStock(item.sku, item.quantity, {
          orderId: data.order_id,
          source: 'POS',
          allowOversell: true, // the sale already happened at the till
        });
        logger.info('Stock decremented', { sku: item.sku, remaining: product.stock, correlationId });
        await WebhookHandler.checkShelfVisuals(item.sku, correlationId);
      } catch (error: any) {
        if (error?.statusCode && error.statusCode < 500) {
          errors.push(`${item.sku}: ${error.message}`);
          continue;
        }
        throw error;
      }
    }

    return errors;
  }

  /**
   * Cancelled or refunded order: put the stock back.
   */
  private static async processOrderReversed(
    data: OrderData,
    eventType: string,
    correlationId: string
  ): Promise<string[]> {
    const errors: string[] = [];

    for (const item of data.line_items) {
      try {
        await InventoryService.restoreStock(item.sku, item.quantity, `${eventType} ${data.order_id}`);
      } catch (error: any) {
        if (error?.code === 'P2025') {
          errors.push(`${item.sku}: product not found`);
          continue;
        }
        throw error;
      }
    }

    logger.info('Stock restored for reversed order', { orderId: data.order_id, eventType, correlationId });
    return errors;
  }

  /**
   * Flag when sales since the last audit warrant a visual check. Camera
   * capture is not integrated yet, so this is surfaced in logs and through
   * GET /api/shelves/audit/due.
   */
  private static async checkShelfVisuals(sku: string, correlationId: string): Promise<void> {
    try {
      if (await InventoryService.needsVisionCheck(sku)) {
        logger.info('Vision audit recommended after sales activity', { sku, correlationId });
      }
    } catch (error: any) {
      logger.error('Failed to evaluate vision check', { sku, error: error.message, correlationId });
    }
  }

  /**
   * GET /api/webhooks/health
   */
  static async healthCheck(_req: Request, res: Response): Promise<Response> {
    return res.status(200).json({
      status: 'OK',
      service: 'webhook-handler',
      signatureVerification: process.env.POS_WEBHOOK_SECRET ? 'enabled' : 'disabled',
      timestamp: new Date().toISOString(),
    });
  }
}
