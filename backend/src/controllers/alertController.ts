// src/controllers/alertController.ts
import { Request, Response } from 'express';
import { AlertService } from '../services/alertService';
import { asyncHandler } from '../middleware/errorHandler';
import { AlertSeverity } from '@prisma/client';
import { logger } from '../utils/logger';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export class AlertController {
  /**
   * GET /api/alerts
   * Get all alerts with optional filtering
   */
  static getAlerts = asyncHandler(async (req: Request, res: Response) => {
    const { severity, status, limit = '50', offset = '0' } = req.query;

    logger.info('Fetching alerts', { severity, status, limit, offset });

    const where: any = {};
    
    if (severity) {
      where.severity = severity as AlertSeverity;
    }
    
    if (status) {
      where.status = status;
    }

    const [alerts, total] = await Promise.all([
      prisma.alert.findMany({
        where,
        include: {
          product: {
            select: {
              sku: true,
              name: true,
              stock: true
            }
          }
        },
        orderBy: [
          { severity: 'asc' }, // CRITICAL first
          { createdAt: 'desc' }
        ],
        take: Number(limit),
        skip: Number(offset)
      }),
      prisma.alert.count({ where })
    ]);

    return res.status(200).json({
      data: alerts,
      pagination: {
        total,
        limit: Number(limit),
        offset: Number(offset),
        hasMore: total > Number(offset) + Number(limit)
      }
    });
  });

  /**
   * GET /api/alerts/stats
   * Get alert statistics
   */
  static getAlertStats = asyncHandler(async (req: Request, res: Response) => {
    const days = Number(req.query.days) || 7;

    logger.info('Fetching alert stats', { days });

    const stats = await AlertService.getAlertStats(days);

    return res.status(200).json({
      data: stats
    });
  });

  /**
   * POST /api/alerts/:alertId/acknowledge
   * Acknowledge an alert
   */
  static acknowledgeAlert = asyncHandler(async (req: Request, res: Response) => {
    const { alertId } = req.params;
    const acknowledgedBy = req.body.acknowledgedBy || 'system';

    logger.info('Acknowledging alert', { alertId, acknowledgedBy });

    const alert = await AlertService.acknowledgeAlert(alertId, acknowledgedBy);

    return res.status(200).json({
      message: 'Alert acknowledged',
      data: alert
    });
  });

  /**
   * POST /api/alerts/:alertId/resolve
   * Resolve an alert
   */
  static resolveAlert = asyncHandler(async (req: Request, res: Response) => {
    const { alertId } = req.params;
    const { resolvedBy, resolution } = req.body;

    logger.info('Resolving alert', { alertId, resolvedBy });

    const alert = await AlertService.resolveAlert(
      alertId, 
      resolvedBy, 
      resolution
    );

    return res.status(200).json({
      message: 'Alert resolved',
      data: alert
    });
  });

  /**
   * GET /api/config/shelf/:shelfLabel
   * Get shelf alert configuration
   */
  static getShelfConfig = asyncHandler(async (req: Request, res: Response) => {
    const { shelfLabel } = req.params;

    const shelf = await prisma.shelf.findUnique({
      where: { label: shelfLabel },
      include: { alertConfig: true }
    });

    if (!shelf) {
      return res.status(404).json({ 
        error: 'Shelf not found',
        shelfLabel 
      });
    }

    return res.status(200).json({
      data: {
        shelf: {
          label: shelf.label,
          zone: shelf.zone,
          lastScanned: shelf.lastScanned
        },
        config: shelf.alertConfig || {
          message: 'No custom configuration set, using defaults'
        }
      }
    });
  });

  /**
   * POST /api/config/shelf/:shelfLabel
   * Update shelf alert configuration
   */
  static updateShelfConfig = asyncHandler(async (req: Request, res: Response) => {
    const { shelfLabel } = req.params;
    const configData = req.body;

    logger.info('Updating shelf config', { shelfLabel, configData });

    // Find the shelf
    const shelf = await prisma.shelf.findUnique({
      where: { label: shelfLabel }
    });

    if (!shelf) {
      return res.status(404).json({ 
        error: 'Shelf not found',
        shelfLabel 
      });
    }

    // Upsert configuration
    const config = await prisma.shelfAlertConfig.upsert({
      where: { shelfId: shelf.id },
      update: configData,
      create: {
        shelfId: shelf.id,
        ...configData
      }
    });

    return res.status(200).json({
      message: 'Configuration updated',
      data: config
    });
  });
}
