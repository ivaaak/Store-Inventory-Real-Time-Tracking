// src/controllers/visionController.ts
import fs from 'fs';
import { Request, Response } from 'express';
import { AlertSeverity, AlertType } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { publish } from '../lib/events';
import { analyzeShelfImage, getVisionProvider, VisionError } from '../services/visionService';
import { InventoryService } from '../services/inventoryService';
import { AlertService } from '../services/alertService';
import { asyncHandler } from '../middleware/errorHandler';
import { logger } from '../utils/logger';
import { PerformAuditInput } from '../validation/schemas';

/** Public URL for a stored upload (served statically from /uploads). */
const uploadUrl = (file: Express.Multer.File) => `/uploads/${file.filename}`;

const removeUpload = (file?: Express.Multer.File) => {
  if (file) fs.promises.unlink(file.path).catch(() => undefined);
};

export class VisionController {
  /**
   * GET /api/vision/status
   * Which vision provider is active, so the UI can explain a disabled state.
   */
  static getStatus = asyncHandler(async (_req: Request, res: Response) => {
    const provider = getVisionProvider();
    return res.status(200).json({ data: { enabled: provider !== null, provider } });
  });

  /**
   * POST /api/vision/audit
   * Receives a multipart image upload and a shelf label.
   */
  static performAudit = asyncHandler(async (req: Request, res: Response) => {
    const { shelfLabel, force } = req.body as PerformAuditInput;
    const imageFile = req.file;

    if (!imageFile) {
      return res.status(400).json({ error: 'Image file is required' });
    }

    const shelf = await prisma.shelf.findUnique({
      where: { label: shelfLabel },
      include: { products: true, alertConfig: true },
    });

    if (!shelf) {
      removeUpload(imageFile);
      return res.status(404).json({ error: 'Shelf not found in system', shelfLabel });
    }

    if (shelf.products.length === 0) {
      removeUpload(imageFile);
      return res.status(400).json({ error: 'No products assigned to this shelf', shelfLabel });
    }

    // Rate-limit audits per shelf unless explicitly forced.
    if (!force && shelf.lastScanned && shelf.alertConfig) {
      const minutesSinceLastScan = (Date.now() - shelf.lastScanned.getTime()) / 60_000;
      const interval = shelf.alertConfig.checkIntervalMinutes;
      if (minutesSinceLastScan < interval) {
        removeUpload(imageFile);
        return res.status(429).json({
          error: 'Audit performed too recently',
          message: `Please wait ${Math.ceil(interval - minutesSinceLastScan)} more minutes, or force the audit.`,
          nextAuditAt: new Date(shelf.lastScanned.getTime() + interval * 60_000),
        });
      }
    }

    logger.info('Starting vision audit', { shelfLabel, imageSize: imageFile.size });

    let aiResults;
    try {
      aiResults = await analyzeShelfImage(
        imageFile.path,
        imageFile.mimetype,
        shelf.products.map((p) => ({ name: p.name, systemCount: p.stock }))
      );
    } catch (error) {
      if (!(error instanceof VisionError)) {
        removeUpload(imageFile);
        throw error;
      }

      // Record the failure per product so it is visible in history, and
      // raise a camera/vision failure alert rather than guessing counts.
      logger.error('Vision audit failed', { shelfLabel, error: error.message });
      await prisma.auditLog.createMany({
        data: shelf.products.map((p) => ({
          productId: p.id,
          shelfId: shelf.id,
          systemCount: p.stock,
          visualCount: 0,
          discrepancy: 0,
          confidence: 0,
          status: 'FAILED' as const,
          imageUrl: uploadUrl(imageFile),
          rawAiOutput: error.rawOutput ?? error.message,
        })),
      });
      await AlertService.createAlert({
        productId: shelf.products[0].id,
        shelfLabel,
        type: AlertType.CAMERA_FAILURE,
        severity: AlertSeverity.MEDIUM,
        message: `Vision audit of ${shelfLabel} failed: ${error.message}`,
      });
      return res.status(502).json({ error: 'Vision analysis failed', details: error.message });
    }

    const auditSummary = [];
    for (const detection of aiResults.detectedItems) {
      const product = shelf.products.find((p) => p.name === detection.name);
      if (!product) continue;

      const auditLog = await prisma.auditLog.create({
        data: {
          productId: product.id,
          shelfId: shelf.id,
          systemCount: product.stock,
          visualCount: detection.count,
          discrepancy: product.stock - detection.count,
          confidence: detection.confidence,
          status: 'COMPLETED',
          imageUrl: uploadUrl(imageFile),
          rawAiOutput: aiResults.rawOutput,
        },
      });

      const alertType = await InventoryService.reconcile(auditLog);

      auditSummary.push({
        auditLogId: auditLog.id,
        productId: product.id,
        sku: product.sku,
        name: product.name,
        systemCount: product.stock,
        visualCount: detection.count,
        discrepancy: product.stock - detection.count,
        status: detection.status,
        confidence: detection.confidence,
        alertType,
      });
    }

    await prisma.shelf.update({
      where: { id: shelf.id },
      data: { lastScanned: new Date() },
    });

    publish({ type: 'audit.completed', shelfLabel, itemsAudited: auditSummary.length });

    const confidences = auditSummary.map((a) => a.confidence);
    return res.status(200).json({
      message: 'Audit completed successfully',
      shelfLabel,
      timestamp: new Date().toISOString(),
      imageUrl: uploadUrl(imageFile),
      provider: aiResults.provider,
      summary: auditSummary,
      metadata: {
        totalProducts: shelf.products.length,
        productsDetected: auditSummary.filter((a) => a.visualCount > 0).length,
        averageConfidence: confidences.length
          ? Number((confidences.reduce((s, c) => s + c, 0) / confidences.length).toFixed(2))
          : 0,
        alertsRaised: auditSummary.filter((a) => a.alertType).length,
      },
    });
  });

  /**
   * GET /api/vision/audits
   * Recent audit logs across all shelves.
   */
  static getRecentAudits = asyncHandler(async (req: Request, res: Response) => {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const offset = Number(req.query.offset) || 0;

    const [auditLogs, total] = await Promise.all([
      prisma.auditLog.findMany({
        include: {
          product: { select: { sku: true, name: true } },
          shelf: { select: { label: true, zone: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.auditLog.count(),
    ]);

    return res.status(200).json({
      data: auditLogs,
      pagination: { total, limit, offset, hasMore: total > offset + limit },
    });
  });

  /**
   * GET /api/vision/history/:shelfLabel
   * Get audit history for a shelf
   */
  static getAuditHistory = asyncHandler(async (req: Request, res: Response) => {
    const { shelfLabel } = req.params;
    const limit = Math.min(Number(req.query.limit) || 20, 200);
    const offset = Number(req.query.offset) || 0;

    const shelf = await prisma.shelf.findUnique({ where: { label: shelfLabel } });
    if (!shelf) {
      return res.status(404).json({ error: 'Shelf not found', shelfLabel });
    }

    const [auditLogs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where: { shelfId: shelf.id },
        include: { product: { select: { sku: true, name: true } } },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.auditLog.count({ where: { shelfId: shelf.id } }),
    ]);

    return res.status(200).json({
      data: auditLogs,
      pagination: { total, limit, offset, hasMore: total > offset + limit },
    });
  });
}
