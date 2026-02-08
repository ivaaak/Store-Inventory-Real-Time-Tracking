// src/controllers/analyticsController.ts
import { Request, Response } from 'express';
import { AnalyticsService } from '../services/analyticsService';
import { logger } from '../utils/logger';
import { asyncHandler } from '../middleware/errorHandler';

export class AnalyticsController {
  /**
   * GET /api/analytics/dashboard
   * Get dashboard overview
   */
  static getDashboardOverview = asyncHandler(async (req: Request, res: Response) => {
    const days = req.query.days ? Number(req.query.days) : 7;

    logger.info('Fetching dashboard overview', { days });

    const overview = await AnalyticsService.getDashboardOverview(days);

    return res.status(200).json({
      data: overview
    });
  });

  /**
   * GET /api/analytics/alert-trends
   * Get alert trends over time
   */
  static getAlertTrends = asyncHandler(async (req: Request, res: Response) => {
    const days = req.query.days ? Number(req.query.days) : 30;

    logger.info('Fetching alert trends', { days });

    const trends = await AnalyticsService.getAlertTrends(days);

    return res.status(200).json({
      data: trends,
      period: `Last ${days} days`
    });
  });

  /**
   * GET /api/analytics/stock-movement
   * Get stock movement analysis
   */
  static getStockMovement = asyncHandler(async (req: Request, res: Response) => {
    const days = req.query.days ? Number(req.query.days) : 30;

    logger.info('Analyzing stock movement', { days });

    const analysis = await AnalyticsService.getStockMovementAnalysis(days);

    return res.status(200).json({
      data: analysis,
      period: `Last ${days} days`
    });
  });

  /**
   * GET /api/analytics/audit-performance
   * Get audit performance metrics
   */
  static getAuditPerformance = asyncHandler(async (req: Request, res: Response) => {
    const days = req.query.days ? Number(req.query.days) : 30;

    logger.info('Calculating audit performance', { days });

    const performance = await AnalyticsService.getAuditPerformance(days);

    return res.status(200).json({
      data: performance,
      period: `Last ${days} days`
    });
  });

  /**
   * GET /api/analytics/phantom-hotspots
   * Get phantom stock hotspots
   */
  static getPhantomHotspots = asyncHandler(async (req: Request, res: Response) => {
    const days = req.query.days ? Number(req.query.days) : 30;

    logger.info('Identifying phantom hotspots', { days });

    const hotspots = await AnalyticsService.getPhantomStockHotspots(days);

    return res.status(200).json({
      data: hotspots,
      period: `Last ${days} days`
    });
  });

  /**
   * GET /api/analytics/system-health
   * Get system health metrics
   */
  static getSystemHealth = asyncHandler(async (req: Request, res: Response) => {
    logger.info('Fetching system health');

    const health = await AnalyticsService.getSystemHealth();

    return res.status(200).json({
      data: health
    });
  });

  /**
   * GET /api/analytics/report
   * Generate comprehensive analytics report
   */
  static generateReport = asyncHandler(async (req: Request, res: Response) => {
    const days = req.query.days ? Number(req.query.days) : 30;

    logger.info('Generating analytics report', { days });

    const report = await AnalyticsService.generateReport(days);

    return res.status(200).json({
      data: report
    });
  });
}
