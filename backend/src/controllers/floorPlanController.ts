// src/controllers/floorPlanController.ts
import { Request, Response } from 'express';
import { FloorPlanService } from '../services/floorPlanService';
import { asyncHandler } from '../middleware/errorHandler';
import { FloorPlanInput } from '../validation/schemas';

export class FloorPlanController {
  /**
   * GET /api/floor-plan
   */
  static getFloorPlan = asyncHandler(async (_req: Request, res: Response) => {
    return res.status(200).json({ data: await FloorPlanService.get() });
  });

  /**
   * PUT /api/floor-plan
   * Saves walls/points and the positions of any shelves included.
   */
  static saveFloorPlan = asyncHandler(async (req: Request, res: Response) => {
    const data = await FloorPlanService.save(req.body as FloorPlanInput);
    return res.status(200).json({ message: 'Floor plan saved', data });
  });
}
