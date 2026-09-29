// src/controllers/alertController.ts
import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { AlertService } from '../services/alertService';
import { asyncHandler } from '../middleware/errorHandler';
import { AlertQuerySchema } from '../validation/schemas';

type AlertQuery = z.infer<typeof AlertQuerySchema>;

export class AlertController {
  /**
   * GET /api/alerts
   * Get alerts with optional filtering (validated by AlertQuerySchema)
   */
  static getAlerts = asyncHandler(async (_req: Request, res: Response) => {
    const { severity, status, statuses, shelfLabel, limit, offset } = res.locals.query as AlertQuery;

    const where: Prisma.AlertWhereInput = {
      ...(severity && { severity }),
      ...(status ? { status } : statuses?.length ? { status: { in: statuses } } : {}),
      ...(shelfLabel && { shelfLabel }),
    };

    const [alerts, total] = await Promise.all([
      prisma.alert.findMany({
        where,
        include: {
          product: { select: { sku: true, name: true, stock: true, minThreshold: true } },
        },
        orderBy: [{ severity: 'asc' }, { createdAt: 'desc' }], // CRITICAL first
        take: limit,
        skip: offset,
      }),
      prisma.alert.count({ where }),
    ]);

    return res.status(200).json({
      data: alerts,
      pagination: { total, limit, offset, hasMore: total > offset + limit },
    });
  });

  /**
   * GET /api/alerts/stats
   * Get alert statistics
   */
  static getAlertStats = asyncHandler(async (req: Request, res: Response) => {
    const days = Number(req.query.days) || 7;
    const stats = await AlertService.getAlertStats(days);
    return res.status(200).json({ data: stats });
  });

  /**
   * POST /api/alerts/:alertId/acknowledge
   */
  static acknowledgeAlert = asyncHandler(async (req: Request, res: Response) => {
    const { alertId } = req.params;
    const acknowledgedBy = req.body.acknowledgedBy || 'system';

    const alert = await AlertService.acknowledgeAlert(alertId, acknowledgedBy);

    return res.status(200).json({ message: 'Alert acknowledged', data: alert });
  });

  /**
   * POST /api/alerts/:alertId/resolve
   */
  static resolveAlert = asyncHandler(async (req: Request, res: Response) => {
    const { alertId } = req.params;
    const { resolvedBy, resolution, dismiss } = req.body;

    const alert = await AlertService.resolveAlert(alertId, resolvedBy, resolution, dismiss);

    return res.status(200).json({
      message: dismiss ? 'Alert dismissed' : 'Alert resolved',
      data: alert,
    });
  });
}
