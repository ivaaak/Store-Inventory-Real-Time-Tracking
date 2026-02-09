// src/webhooks/webhookHandler.ts
import { Request, Response } from 'express';
import crypto from 'crypto';
import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';
import { InventoryService } from '../services/inventoryService';
import { VisionService } from '../services/visionService';
import { PosWebhookSchema } from '../validation/schemas';

const prisma = new PrismaClient();

export class WebhookHandler {
  /**
   * Verify webhook signature from POS system
   */
  private static verifyPosSignature(req: Request): boolean {
    const signature = req.headers['x-pos-signature'] as string;
    const secret = process.env.POS_WEBHOOK_SECRET;

    if (!secret) {
      logger.warn('POS webhook secret not configured, skipping verification');
      return true; // Allow in development
    }

    if (!signature) {
      logger.error('Missing signature in webhook request');
      return false;
    }

    try {
      const payload = JSON.stringify(req.body);
      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(payload)
        .digest('hex');

      return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature)
      );
    } catch (error) {
      logger.error('Signature verification failed', { error });
      return false;
    }
  }

  /**
   * Handle POS sale webhook
   * This endpoint is registered in your POS admin panel
   */
  static async handlePosSale(req: Request, res: Response): Promise<Response> {
    const correlationId = crypto.randomUUID();
    
    try {
      // 1. Log the webhook receipt
      const webhookLog = await prisma.webhookLog.create({
        data: {
          source: 'POS',
          eventType: req.body.event_type || 'unknown',
          payload: JSON.stringify(req.body),
          signature: req.headers['x-pos-signature'] as string,
          verified: false,
          processed: false
        }
      });

      logger.info('Webhook received', { 
        correlationId, 
        webhookLogId: webhookLog.id,
        eventType: req.body.event_type 
      });

      // 2. Verify the signature (Security: Ensure it's actually from the POS)
      if (!this.verifyPosSignature(req)) {
        await prisma.webhookLog.update({
          where: { id: webhookLog.id },
          data: { error: 'Signature verification failed' }
        });
        
        logger.error('Webhook signature verification failed', { correlationId });
        return res.status(401).json({ error: 'Invalid signature' });
      }

      // 3. Update webhook log as verified
      await prisma.webhookLog.update({
        where: { id: webhookLog.id },
        data: { verified: true }
      });

      // 4. Validate webhook payload
      const validationResult = PosWebhookSchema.safeParse(req.body);
      if (!validationResult.success) {
        await prisma.webhookLog.update({
          where: { id: webhookLog.id },
          data: { error: JSON.stringify(validationResult.error.errors) }
        });
        
        logger.error('Webhook validation failed', { 
          correlationId, 
          errors: validationResult.error.errors 
        });
        return res.status(400).json({ error: 'Invalid payload' });
      }

      const { event_type, data } = validationResult.data;

      // 5. Process based on event type
      if (event_type === 'order.completed') {
        await this.processOrderCompleted(data, webhookLog.id, correlationId);
      } else if (event_type === 'order.cancelled') {
        await this.processOrderCancelled(data, webhookLog.id, correlationId);
      } else if (event_type === 'order.refunded') {
        await this.processOrderRefunded(data, webhookLog.id, correlationId);
      }

      // 6. Mark as processed
      await prisma.webhookLog.update({
        where: { id: webhookLog.id },
        data: { 
          processed: true,
          processedAt: new Date()
        }
      });

      logger.info('Webhook processed successfully', { correlationId });

      // Always acknowledge quickly to prevent retries
      return res.status(200).json({ 
        status: 'ACK',
        correlationId 
      });

    } catch (error: any) {
      logger.error('Webhook processing error', { 
        correlationId, 
        error: error.message,
        stack: error.stack
      });

      // Still return 200 to prevent retries on our internal errors
      return res.status(200).json({ 
        status: 'ACK',
        error: 'Internal processing error',
        correlationId 
      });
    }
  }

  /**
   * Process completed order
   */
  private static async processOrderCompleted(
    data: any, 
    webhookLogId: string,
    correlationId: string
  ): Promise<void> {
    logger.info('Processing order completed', { 
      orderId: data.order_id, 
      correlationId 
    });

    for (const item of data.line_items) {
      try {
        // Decrement stock in the database
        const product = await InventoryService.subtractStock(
          item.sku, 
          item.quantity,
          data.order_id
        );

        logger.info('Stock decremented', {
          sku: item.sku,
          quantity: item.quantity,
          remainingStock: product.stock,
          correlationId
        });

        // Check if we need to trigger a vision audit
        await this.checkShelfVisuals(item.sku, correlationId);

      } catch (error: any) {
        logger.error('Failed to process line item', {
          sku: item.sku,
          error: error.message,
          correlationId
        });

        // Log error but continue processing other items
        await prisma.webhookLog.update({
          where: { id: webhookLogId },
          data: { 
            error: `Failed to process ${item.sku}: ${error.message}` 
          }
        });
      }
    }
  }

  /**
   * Process cancelled order (restore stock)
   */
  private static async processOrderCancelled(
    data: any,
    webhookLogId: string,
    correlationId: string
  ): Promise<void> {
    logger.info('Processing order cancellation', { 
      orderId: data.order_id, 
      correlationId 
    });

    for (const item of data.line_items) {
      try {
        // Restore stock
        await prisma.product.update({
          where: { sku: item.sku },
          data: { stock: { increment: item.quantity } }
        });

        logger.info('Stock restored after cancellation', {
          sku: item.sku,
          quantity: item.quantity,
          correlationId
        });
      } catch (error: any) {
        logger.error('Failed to restore stock', {
          sku: item.sku,
          error: error.message,
          correlationId
        });
      }
    }
  }

  /**
   * Process refunded order
   */
  private static async processOrderRefunded(
    data: any,
    webhookLogId: string,
    correlationId: string
  ): Promise<void> {
    // Similar to cancellation - restore stock
    await this.processOrderCancelled(data, webhookLogId, correlationId);
  }

  /**
   * Check if vision audit is needed based on sales activity
   * LOGIC: If stock is now low, trigger the Vision Camera check
   */
  private static async checkShelfVisuals(
    sku: string,
    correlationId: string
  ): Promise<void> {
    try {
      const needsCheck = await InventoryService.needsVisionCheck(sku);
      
      if (needsCheck) {
        logger.info('Vision audit triggered by sales', { sku, correlationId });
        
        // Queue vision audit (in production, use job queue like Bull)
        // For now, we'll just log it
        const product = await prisma.product.findUnique({
          where: { sku },
          include: { shelf: true }
        });

        if (product?.shelf) {
          logger.info('Vision audit queued', {
            sku,
            shelfLabel: product.shelf.label,
            correlationId
          });
          
          // TODO: Implement actual camera trigger
          // await VisionService.triggerCameraSnapshot(product.shelf.cameraUrl);
        }
      }
    } catch (error: any) {
      logger.error('Failed to check shelf visuals', {
        sku,
        error: error.message,
        correlationId
      });
    }
  }

  /**
   * Health check endpoint for webhook provider
   */
  static async healthCheck(req: Request, res: Response): Promise<Response> {
    return res.status(200).json({ 
      status: 'OK',
      service: 'webhook-handler',
      timestamp: new Date().toISOString()
    });
  }
}
