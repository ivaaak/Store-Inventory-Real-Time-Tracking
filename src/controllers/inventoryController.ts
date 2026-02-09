// src/controllers/inventoryController.ts
import { Request, Response } from 'express';
import { InventoryService } from '../services/inventoryService';
import { asyncHandler } from '../middleware/errorHandler';
import { logger } from '../utils/logger';

export class InventoryController {
  /**
   * POST /api/stock/add
   * Triggered when staff scans items onto a specific shelf.
   */
  static addStock = asyncHandler(async (req: Request, res: Response) => {
    const { sku, quantity, shelfLabel } = req.body;

    logger.info('Adding stock', { sku, quantity, shelfLabel });

    const result = await InventoryService.commitStock(
      sku, 
      Number(quantity), 
      shelfLabel
    );
    
    return res.status(200).json({
      message: "Stock successfully added",
      data: {
        sku: result.sku,
        name: result.name,
        currentStock: result.stock,
        shelfLabel
      }
    });
  });

  /**
   * POST /api/stock/sale
   * Triggered by a POS Webhook or manual entry when a customer buys an item.
   */
  static recordSale = asyncHandler(async (req: Request, res: Response) => {
    const { sku, quantity, orderId } = req.body;

    logger.info('Recording sale', { sku, quantity, orderId });

    const product = await InventoryService.subtractStock(
      sku, 
      Number(quantity),
      orderId
    );
    
    return res.status(200).json({
      message: "Sale recorded successfully",
      data: {
        sku: product.sku,
        name: product.name,
        remainingStock: product.stock,
        needsRestock: product.stock <= product.minThreshold,
        belowThreshold: product.stock <= product.minThreshold
      }
    });
  });

  /**
   * GET /api/stock/:sku
   * Get current stock level for a product
   */
  static getStock = asyncHandler(async (req: Request, res: Response) => {
    const { sku } = req.params;
    
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient();

    const product = await prisma.product.findUnique({
      where: { sku },
      include: {
        shelf: true,
        auditLogs: {
          orderBy: { createdAt: 'desc' },
          take: 1
        }
      }
    });

    if (!product) {
      return res.status(404).json({ 
        error: 'Product not found',
        sku 
      });
    }

    const latestAudit = product.auditLogs[0];

    return res.status(200).json({
      data: {
        sku: product.sku,
        name: product.name,
        currentStock: product.stock,
        minThreshold: product.minThreshold,
        maxCapacity: product.maxCapacity,
        shelf: product.shelf ? {
          label: product.shelf.label,
          zone: product.shelf.zone
        } : null,
        lastAudit: latestAudit ? {
          systemCount: latestAudit.systemCount,
          visualCount: latestAudit.visualCount,
          discrepancy: latestAudit.discrepancy,
          confidence: latestAudit.confidence,
          timestamp: latestAudit.createdAt
        } : null,
        needsRestock: product.stock <= product.minThreshold
      }
    });
  });

  /**
   * GET /api/stock/:sku/velocity
   * Get sales velocity for a product
   */
  static getSalesVelocity = asyncHandler(async (req: Request, res: Response) => {
    const { sku } = req.params;
    const hoursBack = Number(req.query.hours) || 24;

    logger.info('Getting sales velocity', { sku, hoursBack });

    const velocity = await InventoryService.getSalesVelocity(sku, hoursBack);

    return res.status(200).json({
      data: {
        sku,
        hoursAnalyzed: hoursBack,
        totalSold: velocity,
        averagePerHour: (velocity / hoursBack).toFixed(2)
      }
    });
  });
}
