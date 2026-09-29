// src/services/floorPlanService.ts
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { publish } from '../lib/events';
import { FloorPlanInput } from '../validation/schemas';

const LAYOUT_ID = 'default';

// A bare rectangle so a fresh install has something to draw on.
const DEFAULT_LAYOUT: Omit<FloorPlanInput, 'shelves'> = {
  walls: [
    { id: 'w1', x1: 40, y1: 40, x2: 760, y2: 40 },
    { id: 'w2', x1: 760, y1: 40, x2: 760, y2: 560 },
    { id: 'w3', x1: 760, y1: 560, x2: 40, y2: 560 },
    { id: 'w4', x1: 40, y1: 560, x2: 40, y2: 40 },
  ],
  points: [],
};

export class FloorPlanService {
  /**
   * Walls and points of interest come from the stored layout; shelves (and
   * their positions) come from the Shelf table so the plan always reflects
   * real shelves.
   */
  static async get() {
    const row = await prisma.floorPlan.findUnique({ where: { id: LAYOUT_ID } });
    const layout = (row?.layout as Omit<FloorPlanInput, 'shelves'> | undefined) ?? DEFAULT_LAYOUT;
    return { walls: layout.walls ?? [], points: layout.points ?? [], updatedAt: row?.updatedAt ?? null };
  }

  static async save({ walls, points, shelves = [] }: FloorPlanInput) {
    const layout = { walls, points } as unknown as Prisma.InputJsonValue;

    await prisma.$transaction([
      prisma.floorPlan.upsert({
        where: { id: LAYOUT_ID },
        update: { layout },
        create: { id: LAYOUT_ID, layout },
      }),
      ...shelves.map((s) =>
        prisma.shelf.updateMany({ where: { label: s.label }, data: { posX: s.x, posY: s.y } })
      ),
    ]);

    publish({ type: 'floorplan.changed' });
    return FloorPlanService.get();
  }
}
