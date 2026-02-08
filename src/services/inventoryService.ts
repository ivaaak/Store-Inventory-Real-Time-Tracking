// src/services/inventoryService.ts
import { PrismaClient, Product, AlertType, AlertSeverity } from '@prisma/client';
import { logger } from '../utils/logger';
import { AlertService } from './alertService';

const prisma = new PrismaClient();

export class InventoryService {
  /**
   * Called when a staff member physically puts items on a shelf.
   */
  static async commitStock(sku: string, qty: number, shelfLabel: string): Promise<Product> {
    logger.info('Committing stock to shelf', { sku, qty, shelfLabel });

    return await prisma.$transaction(async (tx) => {
      // 1. Find or create the shelf
      const shelf = await tx.shelf.upsert({
        where: { label: shelfLabel },
        update: { lastScanned: new Date() },
        create: { 
          label: shelfLabel, 
          lastScanned: new Date() 
        }
      });

      // 2. Update product and link to shelf
      const product = await tx.product.update({
        where: { sku },
        data: { 
          stock: { increment: qty },
          shelfId: shelf.id
        }
      });

      // 3. Check if we're now overstocked
      if (product.stock > product.maxCapacity) {
        await AlertService.createAlert({
          productId: product.id,
          shelfLabel: shelf.label,
          type: AlertType.OVERSTOCKED,
          severity: AlertSeverity.MEDIUM,
          message: `Product ${product.name} exceeds max capacity. Current: ${product.stock}, Max: ${product.maxCapacity}`,
        });
      }

      logger.info('Stock committed successfully', { 
        sku, 
        newStock: product.stock,
        shelfId: shelf.id 
      });

      return product;
    });
  }

  /**
   * Subtract stock when a sale occurs
   * IMPLEMENTED: This was previously throwing "Method not implemented"
   */
  static async subtractStock(sku: string, quantity: number, orderId?: string): Promise<Product> {
    logger.info('Subtracting stock for sale', { sku, quantity, orderId });

    return await prisma.$transaction(async (tx) => {
      // 1. Get current product state
      const product = await tx.product.findUnique({ where: { sku } });
      
      if (!product) {
        throw new Error(`Product with SKU ${sku} not found`);
      }

      if (product.stock < quantity) {
        logger.warn('Attempted to sell more than available stock', {
          sku,
          requested: quantity,
          available: product.stock
        });
        throw new Error(`Insufficient stock for ${sku}. Available: ${product.stock}, Requested: ${quantity}`);
      }

      const stockBefore = product.stock;

      // 2. Decrement stock
      const updatedProduct = await tx.product.update({
        where: { sku },
        data: { stock: { decrement: quantity } }
      });

      // 3. Log the sale event
      await tx.saleEvent.create({
        data: {
          productId: product.id,
          quantity,
          orderId,
          stockBefore,
          stockAfter: updatedProduct.stock,
          source: orderId ? 'POS' : 'MANUAL'
        }
      });

      // 4. Check if we need to trigger alerts
      if (updatedProduct.stock <= updatedProduct.minThreshold) {
        await AlertService.createAlert({
          productId: product.id,
          shelfLabel: product.shelfId ? 'Unknown' : 'Unknown', // Will be resolved in alert service
          type: AlertType.LOW_STOCK,
          severity: updatedProduct.stock === 0 ? AlertSeverity.CRITICAL : AlertSeverity.HIGH,
          message: `Low stock alert for ${product.name}. Current stock: ${updatedProduct.stock}`,
        });
      }

      logger.info('Stock subtracted successfully', {
        sku,
        quantitySold: quantity,
        remainingStock: updatedProduct.stock
      });

      return updatedProduct;
    });
  }

  /**
   * The "Reconciliation Engine"
   * Compares the digital book vs. the visual AI audit.
   */
  static async reconcile(productId: string): Promise<void> {
    logger.info('Starting reconciliation', { productId });

    const product = await prisma.product.findUnique({ 
      where: { id: productId },
      include: { 
        shelf: true,
        auditLogs: { 
          orderBy: { createdAt: 'desc' }, 
          take: 1 
        } 
      }
    });

    if (!product || product.auditLogs.length === 0) {
      logger.warn('No audit logs found for reconciliation', { productId });
      return;
    }

    const latestAudit = product.auditLogs[0];
    const discrepancy = Math.abs(latestAudit.discrepancy);
    
    // Get alert configuration for this shelf
    const alertConfig = product.shelfId 
      ? await prisma.shelfAlertConfig.findUnique({ 
          where: { shelfId: product.shelfId } 
        })
      : null;

    const phantomThreshold = alertConfig?.phantomStockThreshold ?? 5;

    logger.info('Reconciliation data', {
      productId,
      systemCount: latestAudit.systemCount,
      visualCount: latestAudit.visualCount,
      discrepancy,
      phantomThreshold
    });

    // CRITICAL: Phantom Stock Detection
    // System thinks we have stock, but shelf is visually empty
    if (latestAudit.visualCount === 0 && latestAudit.systemCount > phantomThreshold) {
      await this.triggerPhantomStockAlert(product, latestAudit);
    }
    
    // HIGH: Significant discrepancy requiring manual review
    else if (discrepancy > 3 && latestAudit.confidence > 0.8) {
      await AlertService.createAlert({
        productId: product.id,
        shelfLabel: product.shelf?.label ?? 'Unknown',
        type: AlertType.DISCREPANCY,
        severity: AlertSeverity.HIGH,
        message: `Count discrepancy detected for ${product.name}. System: ${latestAudit.systemCount}, Visual: ${latestAudit.visualCount}`,
      });
    }
    
    // MEDIUM: Small discrepancy, possibly due to misplacement or scanning error
    else if (discrepancy >= 1 && latestAudit.confidence > 0.7) {
      await AlertService.createAlert({
        productId: product.id,
        shelfLabel: product.shelf?.label ?? 'Unknown',
        type: AlertType.DISCREPANCY,
        severity: AlertSeverity.MEDIUM,
        message: `Minor count mismatch for ${product.name}. System: ${latestAudit.systemCount}, Visual: ${latestAudit.visualCount}`,
      });
    }

    // Update audit log to mark alert as triggered
    await prisma.auditLog.update({
      where: { id: latestAudit.id },
      data: { 
        alertTriggered: true,
        alertType: this.determineAlertType(latestAudit.systemCount, latestAudit.visualCount, phantomThreshold)
      }
    });

    logger.info('Reconciliation completed', { productId });
  }

  /**
   * Trigger urgent alert for phantom stock
   */
  private static async triggerPhantomStockAlert(product: any, auditLog: any): Promise<void> {
    logger.error('PHANTOM STOCK DETECTED', {
      productId: product.id,
      productName: product.name,
      systemCount: auditLog.systemCount,
      visualCount: auditLog.visualCount,
      shelfLabel: product.shelf?.label
    });

    await AlertService.createAlert({
      productId: product.id,
      shelfLabel: product.shelf?.label ?? 'Unknown',
      type: AlertType.PHANTOM_STOCK,
      severity: AlertSeverity.CRITICAL,
      message: `CRITICAL: Phantom stock detected for ${product.name}. Database shows ${auditLog.systemCount} units, but shelf is EMPTY!`,
    });
  }

  /**
   * Determine alert type based on counts
   */
  private static determineAlertType(systemCount: number, visualCount: number, threshold: number): AlertType | null {
    if (visualCount === 0 && systemCount > threshold) {
      return AlertType.PHANTOM_STOCK;
    } else if (Math.abs(systemCount - visualCount) > 3) {
      return AlertType.DISCREPANCY;
    } else if (systemCount <= threshold) {
      return AlertType.LOW_STOCK;
    }
    return null;
  }

  /**
   * Get recent sales for a product to detect velocity patterns
   */
  static async getSalesVelocity(sku: string, hoursBack: number = 24): Promise<number> {
    const product = await prisma.product.findUnique({ where: { sku } });
    if (!product) return 0;

    const since = new Date(Date.now() - hoursBack * 60 * 60 * 1000);
    
    const sales = await prisma.saleEvent.aggregate({
      where: {
        productId: product.id,
        createdAt: { gte: since }
      },
      _sum: { quantity: true }
    });

    return sales._sum.quantity ?? 0;
  }

  /**
   * Check if a product needs vision audit based on sales activity
   */
  static async needsVisionCheck(sku: string): Promise<boolean> {
    const product = await prisma.product.findUnique({ 
      where: { sku },
      include: { 
        shelf: { 
          include: { 
            alertConfig: true,
            auditLogs: { 
              orderBy: { createdAt: 'desc' }, 
              take: 1 
            }
          } 
        },
        salesEvents: {
          orderBy: { createdAt: 'desc' },
          take: 1
        }
      }
    });

    if (!product?.shelf?.alertConfig) return false;

    const config = product.shelf.alertConfig;
    const lastAudit = product.shelf.auditLogs[0];
    
    // Check time-based trigger
    if (lastAudit) {
      const minutesSinceLastAudit = (Date.now() - lastAudit.createdAt.getTime()) / 1000 / 60;
      if (minutesSinceLastAudit < config.checkIntervalMinutes) {
        return false; // Too soon
      }
    }

    // Check sales-based trigger
    const recentSalesCount = await prisma.saleEvent.count({
      where: {
        productId: product.id,
        createdAt: {
          gte: lastAudit?.createdAt ?? new Date(0)
        }
      }
    });

    return recentSalesCount >= config.salesTriggerCount;
  }
}
