// src/services/inventoryService.ts
import { Product, AlertType, AlertSeverity, AuditLog } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { publish } from '../lib/events';
import { logger } from '../utils/logger';
import { AppError } from '../middleware/errorHandler';
import { AlertService } from './alertService';
import { classifyAudit, DEFAULT_SHELF_CONFIG, lowStockSeverity } from './reconciliation';

export interface SaleOptions {
  orderId?: string;
  source?: 'POS' | 'MANUAL' | 'API';
  /**
   * A POS sale already happened physically. When the book shows fewer units
   * than were sold, record the sale (flooring stock at 0) and raise a
   * discrepancy alert instead of rejecting it.
   */
  allowOversell?: boolean;
}

export class InventoryService {
  /**
   * Called when a staff member physically puts items on a shelf.
   */
  static async commitStock(sku: string, qty: number, shelfLabel: string): Promise<Product> {
    logger.info('Committing stock to shelf', { sku, qty, shelfLabel });

    const { product, shelf } = await prisma.$transaction(async (tx) => {
      const existing = await tx.product.findUnique({ where: { sku } });
      if (!existing) throw new AppError(404, `Product with SKU ${sku} not found`);

      // Restocking is not a visual scan, so lastScanned is left untouched.
      const shelf = await tx.shelf.upsert({
        where: { label: shelfLabel },
        update: {},
        create: { label: shelfLabel },
      });

      const product = await tx.product.update({
        where: { sku },
        data: {
          stock: { increment: qty },
          shelfId: shelf.id,
        },
      });

      return { product, shelf };
    });

    // Side effects run after commit so they never observe rolled-back state.
    publish({ type: 'stock.changed', sku, stock: product.stock, reason: 'restock' });

    if (product.stock > product.minThreshold) {
      await AlertService.autoResolve(product.id, AlertType.LOW_STOCK, `Restocked to ${product.stock} units`);
    }

    if (product.stock > product.maxCapacity) {
      await AlertService.createAlert({
        productId: product.id,
        shelfLabel: shelf.label,
        type: AlertType.OVERSTOCKED,
        severity: AlertSeverity.MEDIUM,
        message: `${product.name} exceeds max capacity. Current: ${product.stock}, Max: ${product.maxCapacity}`,
      });
    }

    return product;
  }

  /**
   * Subtract stock when a sale occurs.
   */
  static async subtractStock(sku: string, quantity: number, options: SaleOptions = {}): Promise<Product> {
    const { orderId, allowOversell = false } = options;
    const source = options.source ?? (orderId ? 'POS' : 'MANUAL');
    logger.info('Subtracting stock for sale', { sku, quantity, orderId, source });

    const { product, shelfLabel, oversold } = await prisma.$transaction(async (tx) => {
      const current = await tx.product.findUnique({
        where: { sku },
        include: { shelf: { select: { label: true } } },
      });
      if (!current) throw new AppError(404, `Product with SKU ${sku} not found`);

      const oversold = Math.max(0, quantity - current.stock);
      if (oversold > 0 && !allowOversell) {
        throw new AppError(409, `Insufficient stock for ${sku}. Available: ${current.stock}, Requested: ${quantity}`);
      }

      // Guard against a concurrent sale having changed stock since the read.
      const decrement = quantity - oversold;
      const { count } = await tx.product.updateMany({
        where: { id: current.id, stock: { gte: decrement } },
        data: { stock: { decrement } },
      });
      if (count === 0) throw new AppError(409, `Stock for ${sku} changed concurrently, please retry`);

      const product = await tx.product.findUniqueOrThrow({ where: { id: current.id } });

      await tx.saleEvent.create({
        data: {
          productId: current.id,
          quantity,
          orderId,
          stockBefore: current.stock,
          stockAfter: product.stock,
          source,
        },
      });

      return { product, shelfLabel: current.shelf?.label ?? 'Unassigned', oversold };
    });

    publish({ type: 'stock.changed', sku, stock: product.stock, reason: 'sale' });

    if (oversold > 0) {
      await AlertService.createAlert({
        productId: product.id,
        shelfLabel,
        type: AlertType.DISCREPANCY,
        severity: AlertSeverity.HIGH,
        message: `POS sold ${quantity} × ${product.name} but only ${quantity - oversold} were on record. Book stock is understated by at least ${oversold}.`,
      });
    }

    if (product.stock <= product.minThreshold) {
      await AlertService.createAlert({
        productId: product.id,
        shelfLabel,
        type: AlertType.LOW_STOCK,
        severity: lowStockSeverity(product.stock),
        message: `Low stock for ${product.name}: ${product.stock} left (minimum ${product.minThreshold}).`,
      });
    }

    return product;
  }

  /**
   * Put stock back, e.g. after a cancelled or refunded order.
   */
  static async restoreStock(sku: string, quantity: number, reason: string): Promise<Product> {
    const product = await prisma.product.update({
      where: { sku },
      data: { stock: { increment: quantity } },
    });

    logger.info('Stock restored', { sku, quantity, reason, stock: product.stock });
    publish({ type: 'stock.changed', sku, stock: product.stock, reason: 'return' });
    return product;
  }

  /**
   * Whether a POS order line was already applied (webhook retries are common).
   */
  static async hasProcessedOrderLine(orderId: string, sku: string): Promise<boolean> {
    const existing = await prisma.saleEvent.findFirst({
      where: { orderId, product: { sku } },
      select: { id: true },
    });
    return existing !== null;
  }

  /**
   * The "Reconciliation Engine"
   * Compares the digital book against a visual AI audit and raises alerts.
   */
  static async reconcile(auditLog: AuditLog): Promise<AlertType | null> {
    const product = await prisma.product.findUnique({
      where: { id: auditLog.productId },
      include: { shelf: { include: { alertConfig: true } } },
    });
    if (!product) return null;

    const phantomThreshold =
      product.shelf?.alertConfig?.phantomStockThreshold ?? DEFAULT_SHELF_CONFIG.phantomStockThreshold;
    const outcome = classifyAudit(auditLog, phantomThreshold);

    logger.info('Reconciliation', {
      sku: product.sku,
      systemCount: auditLog.systemCount,
      visualCount: auditLog.visualCount,
      confidence: auditLog.confidence,
      outcome: outcome?.type ?? 'OK',
    });

    if (!outcome) return null;

    const shelfLabel = product.shelf?.label ?? 'Unassigned';
    const message =
      outcome.type === AlertType.PHANTOM_STOCK
        ? `Phantom stock: the book shows ${auditLog.systemCount} × ${product.name} but the shelf is empty.`
        : `Count mismatch for ${product.name}. System: ${auditLog.systemCount}, Visual: ${auditLog.visualCount}.`;

    await AlertService.createAlert({
      productId: product.id,
      shelfLabel,
      type: outcome.type,
      severity: outcome.severity,
      message,
    });

    await prisma.auditLog.update({
      where: { id: auditLog.id },
      data: { alertTriggered: true, alertType: outcome.type },
    });

    return outcome.type;
  }

  /**
   * Units sold in the last `hoursBack` hours
   */
  static async getSalesVelocity(sku: string, hoursBack: number = 24): Promise<number> {
    const product = await prisma.product.findUnique({ where: { sku } });
    if (!product) throw new AppError(404, `Product with SKU ${sku} not found`);

    const since = new Date(Date.now() - hoursBack * 60 * 60 * 1000);
    const sales = await prisma.saleEvent.aggregate({
      where: { productId: product.id, createdAt: { gte: since } },
      _sum: { quantity: true },
    });

    return sales._sum.quantity ?? 0;
  }

  /**
   * Whether sales since the last shelf audit warrant a new vision check.
   */
  static async needsVisionCheck(sku: string): Promise<boolean> {
    const product = await prisma.product.findUnique({
      where: { sku },
      include: {
        shelf: {
          include: {
            alertConfig: true,
            auditLogs: { orderBy: { createdAt: 'desc' }, take: 1 },
          },
        },
      },
    });

    if (!product?.shelf) return false;

    const config = product.shelf.alertConfig ?? DEFAULT_SHELF_CONFIG;
    const lastAudit = product.shelf.auditLogs[0];

    if (lastAudit) {
      const minutesSinceLastAudit = (Date.now() - lastAudit.createdAt.getTime()) / 60_000;
      if (minutesSinceLastAudit < config.checkIntervalMinutes) return false;
    }

    const salesSinceAudit = await prisma.saleEvent.count({
      where: {
        productId: product.id,
        createdAt: { gte: lastAudit?.createdAt ?? new Date(0) },
      },
    });

    return salesSinceAudit >= config.salesTriggerCount;
  }
}
