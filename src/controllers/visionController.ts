// src/controllers/visionController.ts
import { Request, Response } from 'express';
import { analyzeShelfImage } from '../services/visionService';
import { InventoryService } from '../services/inventoryService';
import { PrismaClient } from '@prisma/client';
import { asyncHandler } from '../middleware/errorHandler';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();

export class VisionController {
  /**
   * POST /api/vision/audit
   * Receives a multipart image upload and a shelf label.
   */
  static performAudit = asyncHandler(async (req: Request, res: Response) => {
    const { shelfLabel, force } = req.body;
    const imageFile = req.file;

    if (!imageFile) {
      return res.status(400).json({ 
        error: "Image file is required" 
      });
    }

    logger.info('Starting vision audit', { shelfLabel, imageSize: imageFile.size });

    // 1. Get current items assigned to this shelf
    const shelf = await prisma.shelf.findUnique({
      where: { label: shelfLabel },
      include: { 
        products: true,
        alertConfig: true
      }
    });

    if (!shelf) {
      return res.status(404).json({ 
        error: "Shelf not found in system",
        shelfLabel 
      });
    }

    // 2. Check if audit is needed (unless forced)
    if (!force && shelf.lastScanned) {
      const config = shelf.alertConfig;
      const minutesSinceLastScan = 
        (Date.now() - shelf.lastScanned.getTime()) / 1000 / 60;
      
      if (config && minutesSinceLastScan < config.checkIntervalMinutes) {
        return res.status(429).json({
          error: 'Audit performed too recently',
          message: `Please wait ${Math.ceil(config.checkIntervalMinutes - minutesSinceLastScan)} more minutes`,
          nextAuditAt: new Date(
            shelf.lastScanned.getTime() + 
            config.checkIntervalMinutes * 60 * 1000
          )
        });
      }
    }

    // 3. Call the Vision AI Service
    const productNames = shelf.products.map(p => p.name);
    
    if (productNames.length === 0) {
      return res.status(400).json({
        error: 'No products assigned to this shelf',
        shelfLabel
      });
    }

    logger.info('Calling vision AI', { 
      shelfLabel, 
      productCount: productNames.length 
    });

    const aiResults = await analyzeShelfImage(imageFile.path, productNames);

    // 4. Process each detection
    const auditSummary = [];
    
    for (const detection of aiResults.detectedItems) {
      const product = shelf.products.find(p => p.name === detection.name);
      
      if (product) {
        // Log the discrepancy in the DB
        const auditLog = await prisma.auditLog.create({
          data: {
            productId: product.id,
            shelfId: shelf.id,
            systemCount: product.stock,
            visualCount: detection.count,
            discrepancy: product.stock - detection.count,
            confidence: detection.confidence,
            status: 'COMPLETED',
            imageUrl: imageFile.path
          }
        });

        logger.info('Audit log created', {
          auditLogId: auditLog.id,
          product: product.name,
          systemCount: product.stock,
          visualCount: detection.count
        });

        // Run the reconciliation logic (e.g., trigger alerts if phantom stock)
        await InventoryService.reconcile(product.id);
        
        auditSummary.push({
          productId: product.id,
          sku: product.sku,
          name: product.name,
          systemCount: product.stock,
          visualCount: detection.count,
          discrepancy: product.stock - detection.count,
          status: detection.status,
          confidence: detection.confidence
        });
      }
    }

    // 5. Update shelf last scanned timestamp
    await prisma.shelf.update({
      where: { id: shelf.id },
      data: { lastScanned: new Date() }
    });

    logger.info('Vision audit completed', { 
      shelfLabel, 
      itemsAudited: auditSummary.length 
    });

    return res.status(200).json({
      message: "Audit completed successfully",
      shelfLabel,
      timestamp: new Date().toISOString(),
      summary: auditSummary,
      metadata: {
        totalProducts: shelf.products.length,
        productsDetected: aiResults.detectedItems.length,
        averageConfidence: (
          aiResults.detectedItems.reduce((sum, d) => sum + d.confidence, 0) / 
          aiResults.detectedItems.length
        ).toFixed(2)
      }
    });
  });

  /**
   * GET /api/vision/history/:shelfLabel
   * Get audit history for a shelf
   */
  static getAuditHistory = asyncHandler(async (req: Request, res: Response) => {
    const { shelfLabel } = req.params;
    const limit = Number(req.query.limit) || 20;
    const offset = Number(req.query.offset) || 0;

    logger.info('Fetching audit history', { shelfLabel, limit, offset });

    const shelf = await prisma.shelf.findUnique({
      where: { label: shelfLabel }
    });

    if (!shelf) {
      return res.status(404).json({ 
        error: 'Shelf not found',
        shelfLabel 
      });
    }

    const [auditLogs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where: { shelfId: shelf.id },
        include: {
          product: {
            select: {
              sku: true,
              name: true
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset
      }),
      prisma.auditLog.count({ where: { shelfId: shelf.id } })
    ]);

    return res.status(200).json({
      data: auditLogs,
      pagination: {
        total,
        limit,
        offset,
        hasMore: total > offset + limit
      }
    });
  });
}
