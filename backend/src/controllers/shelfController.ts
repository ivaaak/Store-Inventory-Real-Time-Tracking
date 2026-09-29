// src/controllers/shelfController.ts
import { Request, Response } from 'express';
import { ShelfService } from '../services/shelfService';
import { logger } from '../utils/logger';
import { asyncHandler } from '../middleware/errorHandler';
import { CreateShelfInput, UpdateShelfConfigInput, UpdateShelfInput } from '../validation/schemas';

export class ShelfController {
  /**
   * POST /api/shelves
   * Create a new shelf
   */
  static createShelf = asyncHandler(async (req: Request, res: Response) => {
    const shelf = await ShelfService.createShelf(req.body as CreateShelfInput);

    return res.status(201).json({
      message: 'Shelf created successfully',
      data: shelf
    });
  });

  /**
   * PUT /api/shelves/:label
   * Update a shelf
   */
  static updateShelf = asyncHandler(async (req: Request, res: Response) => {
    const { label } = req.params;
    const shelf = await ShelfService.updateShelf(label, req.body as UpdateShelfInput);

    return res.status(200).json({
      message: 'Shelf updated successfully',
      data: shelf
    });
  });

  /**
   * DELETE /api/shelves/:label
   * Delete a shelf
   */
  static deleteShelf = asyncHandler(async (req: Request, res: Response) => {
    const { label } = req.params;

    logger.info('Deleting shelf', { label });

    await ShelfService.deleteShelf(label);

    return res.status(200).json({
      message: 'Shelf deleted successfully'
    });
  });

  /**
   * GET /api/shelves/:label
   * Get shelf details
   */
  static getShelf = asyncHandler(async (req: Request, res: Response) => {
    const { label } = req.params;

    logger.info('Fetching shelf', { label });

    const shelf = await ShelfService.getShelfByLabel(label);

    if (!shelf) {
      return res.status(404).json({
        error: 'Shelf not found',
        label
      });
    }

    return res.status(200).json({
      data: shelf
    });
  });

  /**
   * GET /api/shelves
   * List all shelves
   */
  static listShelves = asyncHandler(async (req: Request, res: Response) => {
    const zone = req.query.zone as string | undefined;
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const offset = Number(req.query.offset) || 0;

    const { shelves, total } = await ShelfService.listShelves({ zone, limit, offset });

    return res.status(200).json({
      data: shelves,
      pagination: { total, limit, offset, hasMore: total > offset + limit }
    });
  });

  /**
   * GET /api/shelves/:label/config
   * Get shelf configuration
   */
  static getShelfConfig = asyncHandler(async (req: Request, res: Response) => {
    const { label } = req.params;

    logger.info('Fetching shelf configuration', { label });

    const config = await ShelfService.getShelfConfig(label);

    return res.status(200).json({ data: config });
  });

  /**
   * POST /api/shelves/:label/config
   * Update shelf configuration
   */
  static updateShelfConfig = asyncHandler(async (req: Request, res: Response) => {
    const { label } = req.params;
    const updatedConfig = await ShelfService.updateShelfConfig(label, req.body as UpdateShelfConfigInput);

    return res.status(200).json({
      message: 'Configuration updated successfully',
      data: updatedConfig
    });
  });

  /**
   * GET /api/shelves/audit/due
   * Get shelves due for audit
   */
  static getShelvesDueForAudit = asyncHandler(async (req: Request, res: Response) => {
    logger.info('Fetching shelves due for audit');

    const shelves = await ShelfService.getShelvesDueForAudit();

    return res.status(200).json({
      data: shelves,
      count: shelves.length
    });
  });

  /**
   * GET /api/shelves/:label/metrics
   * Get shelf performance metrics
   */
  static getShelfMetrics = asyncHandler(async (req: Request, res: Response) => {
    const { label } = req.params;
    const days = req.query.days ? Number(req.query.days) : 7;

    logger.info('Calculating shelf metrics', { label, days });

    const metrics = await ShelfService.getShelfMetrics(label, days);

    return res.status(200).json({
      data: metrics,
      period: `Last ${days} days`
    });
  });

  /**
   * GET /api/shelves/zones
   * Get all zones
   */
  static getZones = asyncHandler(async (req: Request, res: Response) => {
    logger.info('Fetching all zones');

    const zones = await ShelfService.getZones();

    return res.status(200).json({
      data: zones
    });
  });

  /**
   * POST /api/shelves/:label/schedule-audit
   * Camera-triggered audits need a job queue and camera integration, neither
   * of which exists yet. Answer honestly instead of pretending to schedule.
   */
  static scheduleAudit = asyncHandler(async (req: Request, res: Response) => {
    return res.status(501).json({
      error: 'Scheduled audits are not implemented yet',
      hint: 'Upload a shelf image to POST /api/vision/audit instead.',
      shelfLabel: req.params.label
    });
  });

  /**
   * GET /api/shelves/:label/capacity
   * Get shelf capacity utilization
   */
  static getCapacityUtilization = asyncHandler(async (req: Request, res: Response) => {
    const { label } = req.params;

    logger.info('Calculating capacity utilization', { label });

    const utilization = await ShelfService.getCapacityUtilization(label);

    return res.status(200).json({
      data: utilization
    });
  });
}
