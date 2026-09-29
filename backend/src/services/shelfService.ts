// src/services/shelfService.ts
import { AlertSeverity, Prisma, Shelf, ShelfAlertConfig } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { publish } from '../lib/events';
import { logger } from '../utils/logger';
import { AppError } from '../middleware/errorHandler';
import { DEFAULT_SHELF_CONFIG } from './reconciliation';
import { CreateShelfInput, UpdateShelfConfigInput, UpdateShelfInput } from '../validation/schemas';

const SEVERITY_RANK: AlertSeverity[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];

const isAuditDue = (
  shelf: Pick<Shelf, 'lastScanned'> & { alertConfig: Pick<ShelfAlertConfig, 'checkIntervalMinutes'> | null },
  now = Date.now()
) => {
  if (!shelf.lastScanned) return true; // never scanned
  const interval = shelf.alertConfig?.checkIntervalMinutes ?? DEFAULT_SHELF_CONFIG.checkIntervalMinutes;
  return (now - shelf.lastScanned.getTime()) / 60_000 >= interval;
};

export class ShelfService {
  static async createShelf(data: CreateShelfInput): Promise<Shelf> {
    // lastScanned stays null: a new shelf has never been audited.
    const shelf = await prisma.shelf.create({ data });
    logger.info('Shelf created', { shelfId: shelf.id, label: shelf.label });
    publish({ type: 'shelf.changed', label: shelf.label });
    return shelf;
  }

  static async updateShelf(label: string, data: UpdateShelfInput): Promise<Shelf> {
    const shelf = await prisma.shelf.update({ where: { label }, data });
    publish({ type: 'shelf.changed', label });
    return shelf;
  }

  static async deleteShelf(label: string): Promise<void> {
    await prisma.shelf.delete({ where: { label } });
    logger.info('Shelf deleted', { label });
    publish({ type: 'shelf.changed', label });
  }

  static async getShelfByLabel(label: string) {
    return prisma.shelf.findUnique({
      where: { label },
      include: {
        products: { orderBy: { name: 'asc' } },
        alertConfig: true,
        auditLogs: { orderBy: { createdAt: 'desc' }, take: 10 },
      },
    });
  }

  /**
   * List shelves with their products and a health summary derived from
   * active alerts, for the dashboard and floor plan.
   */
  static async listShelves(filters: { zone?: string; limit?: number; offset?: number } = {}) {
    const where: Prisma.ShelfWhereInput = filters.zone ? { zone: filters.zone } : {};

    const [shelves, total, activeAlerts] = await Promise.all([
      prisma.shelf.findMany({
        where,
        include: {
          products: {
            select: { id: true, sku: true, name: true, stock: true, minThreshold: true, maxCapacity: true },
            orderBy: { name: 'asc' },
          },
          alertConfig: true,
        },
        take: filters.limit ?? 100,
        skip: filters.offset ?? 0,
        orderBy: { label: 'asc' },
      }),
      prisma.shelf.count({ where }),
      prisma.alert.groupBy({
        by: ['shelfLabel', 'severity'],
        where: { status: { in: ['OPEN', 'ACKNOWLEDGED', 'IN_PROGRESS'] } },
        _count: true,
      }),
    ]);

    const now = Date.now();
    return {
      shelves: shelves.map((shelf) => {
        const alerts = activeAlerts.filter((a) => a.shelfLabel === shelf.label);
        const worst = SEVERITY_RANK.find((sev) => alerts.some((a) => a.severity === sev)) ?? null;
        return {
          ...shelf,
          openAlerts: alerts.reduce((sum, a) => sum + a._count, 0),
          worstSeverity: worst,
          auditDue: isAuditDue(shelf, now),
        };
      }),
      total,
    };
  }

  static async getShelfConfig(label: string) {
    const shelf = await prisma.shelf.findUnique({ where: { label }, include: { alertConfig: true } });
    if (!shelf) throw new AppError(404, 'Shelf not found');
    return {
      shelf: { label: shelf.label, zone: shelf.zone, lastScanned: shelf.lastScanned },
      config: shelf.alertConfig ?? DEFAULT_SHELF_CONFIG,
      isDefault: !shelf.alertConfig,
    };
  }

  static async updateShelfConfig(label: string, config: UpdateShelfConfigInput): Promise<ShelfAlertConfig> {
    const shelf = await prisma.shelf.findUnique({ where: { label } });
    if (!shelf) throw new AppError(404, 'Shelf not found');

    const updated = await prisma.shelfAlertConfig.upsert({
      where: { shelfId: shelf.id },
      update: config,
      create: { shelfId: shelf.id, ...DEFAULT_SHELF_CONFIG, ...config },
    });

    logger.info('Shelf configuration updated', { label, configId: updated.id });
    return updated;
  }

  static async getShelvesDueForAudit() {
    const shelves = await prisma.shelf.findMany({
      include: {
        alertConfig: true,
        products: { select: { id: true, sku: true, name: true } },
      },
      orderBy: { lastScanned: { sort: 'asc', nulls: 'first' } },
    });
    const now = Date.now();
    return shelves.filter((s) => isAuditDue(s, now));
  }

  static async getShelfMetrics(label: string, days: number = 7) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const shelf = await prisma.shelf.findUnique({
      where: { label },
      include: {
        products: true,
        auditLogs: { where: { createdAt: { gte: since } }, orderBy: { createdAt: 'desc' } },
      },
    });
    if (!shelf) throw new AppError(404, 'Shelf not found');

    const auditCount = shelf.auditLogs.length;
    const averageDiscrepancy =
      auditCount > 0 ? shelf.auditLogs.reduce((sum, a) => sum + Math.abs(a.discrepancy), 0) / auditCount : 0;

    return {
      totalProducts: shelf.products.length,
      totalStock: shelf.products.reduce((sum, p) => sum + p.stock, 0),
      lowStockProducts: shelf.products.filter((p) => p.stock <= p.minThreshold).length,
      auditCount,
      averageDiscrepancy: Number(averageDiscrepancy.toFixed(2)),
      lastAuditDate: shelf.auditLogs[0]?.createdAt ?? null,
    };
  }

  static async getZones(): Promise<Array<{ zone: string; shelfCount: number }>> {
    const zones = await prisma.shelf.groupBy({ by: ['zone'], _count: true, where: { zone: { not: null } } });
    return zones.map((z) => ({ zone: z.zone || 'Unknown', shelfCount: z._count }));
  }

  static async getCapacityUtilization(label: string) {
    const shelf = await prisma.shelf.findUnique({ where: { label }, include: { products: true } });
    if (!shelf) throw new AppError(404, 'Shelf not found');

    const currentCapacity = shelf.products.reduce((sum, p) => sum + p.stock, 0);
    const maxCapacity = shelf.products.reduce((sum, p) => sum + p.maxCapacity, 0);
    const utilizationPercent = maxCapacity > 0 ? (currentCapacity / maxCapacity) * 100 : 0;

    let status: 'UNDER' | 'OPTIMAL' | 'OVER' = 'OPTIMAL';
    if (utilizationPercent < 30) status = 'UNDER';
    if (utilizationPercent > 100) status = 'OVER';

    return {
      currentCapacity,
      maxCapacity,
      utilizationPercent: Number(utilizationPercent.toFixed(2)),
      status,
    };
  }
}
