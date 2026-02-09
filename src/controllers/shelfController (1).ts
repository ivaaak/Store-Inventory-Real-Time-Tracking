// src/controllers/shelfController.ts
import { Request, Response } from 'express';
import { ShelfService } from '../services/shelfService';
import { asyncHandler } from '../middleware/errorHandler';
import { logger } from '../utils/logger';

export class ShelfController {
  /**
   * POST /api/shelves
   * Create a new shelf
   */
  static createShelf = asyncHandler(async (req: Request, res: Response) => {
    const { label, zone, cameraUrl } = req.body;

    if (!label) {
      return res.status(400).json({
        error: 'Shelf label is required'
      });
    }

    logger.info('Creating new shelf', { label, zone });

    const shelf = await ShelfService.createShelf({
      label,
      zone,
      cameraUrl
    });

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
    const updates = req.body;

    logger.info('Updating shelf', { label });

    const shelf = await ShelfService.updateShelf(label, updates);

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
    const { zone, limit, offset } = req.query;

    logger.info('Listing shelves', { zone });

    const { shelves, total } = await ShelfService.listShelves({
      zone: zone as string,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined
    });

    return res.status(200).json({
      data: shelves,
      pagination: {
        total,
        limit: Number(limit) || 50,
        offset: Number(offset) || 0,
        hasMore: total > (Number(offset) || 0) + (Number(limit) || 50)
      }
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

    return res.status(200).json({
      data: config || {
        message: 'No custom configuration set, using defaults'
      }
    });
  });

  /**
   * POST /api/shelves/:label/config
   * Update shelf configuration
   */
  static updateShelfConfig = asyncHandler(async (req: Request, res: Response) => {
    const { label } = req.params;
    const config = req.body;

    logger.info('Updating shelf configuration', { label });

    const updatedConfig = await ShelfService.updateShelfConfig(label, config);

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
   * Schedule a shelf audit
   */
  static scheduleAudit = asyncHandler(async (req: Request, res: Response) => {
    const { label } = req.params;
    const { scheduledFor } = req.body;

    logger.info('Scheduling audit', { label, scheduledFor });

    await ShelfService.scheduleAudit(
      label, 
      scheduledFor ? new Date(scheduledFor) : undefined
    );

    return res.status(200).json({
      message: 'Audit scheduled successfully',
      scheduledFor: scheduledFor || new Date()
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
