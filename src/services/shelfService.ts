// src/services/shelfService.ts
import { PrismaClient, Shelf, ShelfAlertConfig } from '@prisma/client';
import { logger } from '../utils/logger';
import { AppError } from '../middleware/errorHandler';

const prisma = new PrismaClient();

export class ShelfService {
  /**
   * Create a new shelf
   */
  static async createShelf(data: {
    label: string;
    zone?: string;
    cameraUrl?: string;
  }): Promise<Shelf> {
    logger.info('Creating shelf', { label: data.label });

    try {
      const shelf = await prisma.shelf.create({
        data: {
          label: data.label,
          zone: data.zone,
          cameraUrl: data.cameraUrl,
          lastScanned: new Date()
        }
      });

      logger.info('Shelf created successfully', { 
        shelfId: shelf.id, 
        label: shelf.label 
      });

      return shelf;
    } catch (error: any) {
      logger.error('Failed to create shelf', { 
        error: error.message,
        label: data.label 
      });
      throw error;
    }
  }

  /**
   * Update shelf details
   */
  static async updateShelf(
    label: string,
    data: Partial<Shelf>
  ): Promise<Shelf> {
    logger.info('Updating shelf', { label, updates: Object.keys(data) });

    try {
      const shelf = await prisma.shelf.update({
        where: { label },
        data
      });

      logger.info('Shelf updated successfully', { 
        shelfId: shelf.id, 
        label: shelf.label 
      });

      return shelf;
    } catch (error: any) {
      logger.error('Failed to update shelf', { 
        error: error.message,
        label 
      });
      throw error;
    }
  }

  /**
   * Delete a shelf
   */
  static async deleteShelf(label: string): Promise<void> {
    logger.info('Deleting shelf', { label });

    try {
      await prisma.shelf.delete({
        where: { label }
      });

      logger.info('Shelf deleted successfully', { label });
    } catch (error: any) {
      logger.error('Failed to delete shelf', { 
        error: error.message,
        label 
      });
      throw error;
    }
  }

  /**
   * Get shelf by label
   */
  static async getShelfByLabel(label: string) {
    try {
      return await prisma.shelf.findUnique({
        where: { label },
        include: {
          products: {
            orderBy: { name: 'asc' }
          },
          alertConfig: true,
          auditLogs: {
            orderBy: { createdAt: 'desc' },
            take: 10
          }
        }
      });
    } catch (error: any) {
      logger.error('Failed to get shelf', { error: error.message, label });
      throw error;
    }
  }

  /**
   * List all shelves
   */
  static async listShelves(filters?: {
    zone?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ shelves: Shelf[]; total: number }> {
    const where: any = {};

    if (filters?.zone) {
      where.zone = filters.zone;
    }

    const [shelves, total] = await Promise.all([
      prisma.shelf.findMany({
        where,
        include: {
          products: {
            select: {
              id: true,
              sku: true,
              name: true,
              stock: true
            }
          },
          alertConfig: true
        },
        take: filters?.limit || 50,
        skip: filters?.offset || 0,
        orderBy: { label: 'asc' }
      }),
      prisma.shelf.count({ where })
    ]);

    return { shelves, total };
  }

  /**
   * Get shelf configuration
   */
  static async getShelfConfig(label: string): Promise<ShelfAlertConfig | null> {
    logger.info('Getting shelf configuration', { label });

    const shelf = await prisma.shelf.findUnique({
      where: { label },
      include: { alertConfig: true }
    });

    if (!shelf) {
      throw new AppError(404, 'Shelf not found');
    }

    return shelf.alertConfig;
  }

  /**
   * Update shelf configuration
   */
  static async updateShelfConfig(
    label: string,
    config: Partial<ShelfAlertConfig>
  ): Promise<ShelfAlertConfig> {
    logger.info('Updating shelf configuration', { label, config });

    const shelf = await prisma.shelf.findUnique({
      where: { label }
    });

    if (!shelf) {
      throw new AppError(404, 'Shelf not found');
    }

    const updatedConfig = await prisma.shelfAlertConfig.upsert({
      where: { shelfId: shelf.id },
      update: config,
      create: {
        shelfId: shelf.id,
        phantomStockThreshold: config.phantomStockThreshold || 5,
        lowStockThreshold: config.lowStockThreshold || 3,
        checkIntervalMinutes: config.checkIntervalMinutes || 30,
        salesTriggerCount: config.salesTriggerCount || 10,
        enableSlack: config.enableSlack ?? true,
        enableSms: config.enableSms ?? false,
        enableEmail: config.enableEmail ?? true,
      }
    });

    logger.info('Shelf configuration updated', { 
      label, 
      configId: updatedConfig.id 
    });

    return updatedConfig;
  }

  /**
   * Get shelves needing audit
   */
  static async getShelvesDueForAudit(): Promise<Shelf[]> {
    logger.info('Finding shelves due for audit');

    const now = new Date();
    const shelves = await prisma.shelf.findMany({
      include: {
        alertConfig: true,
        products: {
          select: { id: true, sku: true, name: true }
        }
      }
    });

    const shelvesNeedingAudit = shelves.filter(shelf => {
      if (!shelf.alertConfig || !shelf.lastScanned) {
        return true; // Never scanned
      }

      const minutesSinceLastScan = 
        (now.getTime() - shelf.lastScanned.getTime()) / 1000 / 60;

      return minutesSinceLastScan >= shelf.alertConfig.checkIntervalMinutes;
    });

    logger.info('Found shelves needing audit', { 
      count: shelvesNeedingAudit.length 
    });

    return shelvesNeedingAudit;
  }

  /**
   * Get shelf performance metrics
   */
  static async getShelfMetrics(
    label: string,
    days: number = 7
  ): Promise<{
    totalProducts: number;
    totalStock: number;
    lowStockProducts: number;
    auditCount: number;
    averageDiscrepancy: number;
    lastAuditDate: Date | null;
  }> {
    logger.info('Calculating shelf metrics', { label, days });

    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const shelf = await prisma.shelf.findUnique({
      where: { label },
      include: {
        products: true,
        auditLogs: {
          where: { createdAt: { gte: since } }
        }
      }
    });

    if (!shelf) {
      throw new AppError(404, 'Shelf not found');
    }

    const totalProducts = shelf.products.length;
    const totalStock = shelf.products.reduce((sum, p) => sum + p.stock, 0);
    const lowStockProducts = shelf.products.filter(
      p => p.stock <= p.minThreshold
    ).length;

    const auditCount = shelf.auditLogs.length;
    const averageDiscrepancy = auditCount > 0
      ? shelf.auditLogs.reduce((sum, a) => sum + Math.abs(a.discrepancy), 0) / auditCount
      : 0;

    const lastAuditDate = shelf.auditLogs.length > 0
      ? shelf.auditLogs.sort((a, b) => 
          b.createdAt.getTime() - a.createdAt.getTime()
        )[0].createdAt
      : null;

    return {
      totalProducts,
      totalStock,
      lowStockProducts,
      auditCount,
      averageDiscrepancy: Number(averageDiscrepancy.toFixed(2)),
      lastAuditDate
    };
  }

  /**
   * Get all zones
   */
  static async getZones(): Promise<Array<{ zone: string; shelfCount: number }>> {
    logger.info('Fetching all zones');

    const zones = await prisma.shelf.groupBy({
      by: ['zone'],
      _count: true,
      where: { zone: { not: null } }
    });

    return zones.map(z => ({
      zone: z.zone || 'Unknown',
      shelfCount: z._count
    }));
  }

  /**
   * Schedule shelf audit
   */
  static async scheduleAudit(label: string, scheduledFor?: Date): Promise<void> {
    logger.info('Scheduling shelf audit', { label, scheduledFor });

    // TODO: Implement job queue integration (Bull/BullMQ)
    // For now, just log the scheduled audit
    
    logger.info('Audit scheduled', {
      label,
      scheduledFor: scheduledFor || new Date()
    });
  }

  /**
   * Get shelf capacity utilization
   */
  static async getCapacityUtilization(label: string): Promise<{
    currentCapacity: number;
    maxCapacity: number;
    utilizationPercent: number;
    status: 'UNDER' | 'OPTIMAL' | 'OVER';
  }> {
    const shelf = await prisma.shelf.findUnique({
      where: { label },
      include: { products: true }
    });

    if (!shelf) {
      throw new AppError(404, 'Shelf not found');
    }

    const currentCapacity = shelf.products.reduce((sum, p) => sum + p.stock, 0);
    const maxCapacity = shelf.products.reduce((sum, p) => sum + p.maxCapacity, 0);
    const utilizationPercent = maxCapacity > 0 
      ? (currentCapacity / maxCapacity) * 100 
      : 0;

    let status: 'UNDER' | 'OPTIMAL' | 'OVER' = 'OPTIMAL';
    if (utilizationPercent < 30) status = 'UNDER';
    if (utilizationPercent > 100) status = 'OVER';

    return {
      currentCapacity,
      maxCapacity,
      utilizationPercent: Number(utilizationPercent.toFixed(2)),
      status
    };
  }
}
