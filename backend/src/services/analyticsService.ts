// src/services/analyticsService.ts
import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';
import { ProductService } from './productService';
import { ShelfService } from './shelfService';

const DAY_MS = 24 * 60 * 60 * 1000;

export class AnalyticsService {
  /**
   * Get dashboard overview statistics
   */
  static async getDashboardOverview(days: number = 7) {
    logger.info('Generating dashboard overview', { days });

    const since = new Date(Date.now() - days * DAY_MS);

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const [
      summary,
      totalShelves,
      shelvesDue,
      openAlerts,
      criticalAlerts,
      recentAudits,
      auditsToday,
      totalSales,
      phantomStockIncidents,
      auditAccuracy
    ] = await Promise.all([
      ProductService.getInventorySummary(),
      prisma.shelf.count(),
      ShelfService.getShelvesDueForAudit(),
      prisma.alert.count({ where: { status: { in: ['OPEN', 'ACKNOWLEDGED', 'IN_PROGRESS'] } } }),
      prisma.alert.count({ where: { status: { in: ['OPEN', 'ACKNOWLEDGED', 'IN_PROGRESS'] }, severity: 'CRITICAL' } }),
      prisma.auditLog.count({ where: { createdAt: { gte: since } } }),
      prisma.auditLog.count({ where: { createdAt: { gte: startOfToday } } }),
      prisma.saleEvent.aggregate({ where: { createdAt: { gte: since } }, _sum: { quantity: true } }),
      prisma.alert.count({ where: { type: 'PHANTOM_STOCK', createdAt: { gte: since } } }),
      // Mean model confidence over completed audits
      prisma.auditLog.aggregate({
        where: { createdAt: { gte: since }, status: 'COMPLETED' },
        _avg: { confidence: true }
      })
    ]);

    return {
      inventory: {
        totalProducts: summary.totalProducts,
        totalStock: summary.totalStock,
        inStockProducts: summary.inStockItems,
        lowStockProducts: summary.lowStockItems,
        outOfStockProducts: summary.outOfStockItems,
        overstockedProducts: summary.overstockedItems,
        stockValue: summary.stockValue
      },
      shelves: {
        total: totalShelves,
        needingAudit: shelvesDue.length
      },
      alerts: {
        open: openAlerts,
        critical: criticalAlerts,
        phantomStockIncidents
      },
      audits: {
        recent: recentAudits,
        today: auditsToday,
        averageConfidence: auditAccuracy._avg.confidence ?? null
      },
      sales: {
        totalQuantity: totalSales._sum.quantity || 0,
        period: `Last ${days} days`
      }
    };
  }

  /**
   * Get alert trends over time
   */
  static async getAlertTrends(days: number = 30) {
    logger.info('Calculating alert trends', { days });

    const since = new Date(Date.now() - days * DAY_MS);

    const alerts = await prisma.alert.findMany({
      where: { createdAt: { gte: since } },
      select: {
        createdAt: true,
        type: true,
        severity: true
      }
    });

    // One bucket per day (UTC), including days without alerts, so charts
    // get a continuous axis.
    const trendsByDay: { [key: string]: any } = {};
    for (let i = days - 1; i >= 0; i--) {
      const dateKey = new Date(Date.now() - i * DAY_MS).toISOString().split('T')[0];
      trendsByDay[dateKey] = {
        date: dateKey,
        total: 0,
        critical: 0,
        high: 0,
        medium: 0,
        low: 0,
        phantomStock: 0,
        lowStock: 0,
        discrepancy: 0
      };
    }

    alerts.forEach(alert => {
      const dateKey = alert.createdAt.toISOString().split('T')[0];
      if (!trendsByDay[dateKey]) return;

      trendsByDay[dateKey].total++;
      trendsByDay[dateKey][alert.severity.toLowerCase()]++;
      
      if (alert.type === 'PHANTOM_STOCK') trendsByDay[dateKey].phantomStock++;
      if (alert.type === 'LOW_STOCK') trendsByDay[dateKey].lowStock++;
      if (alert.type === 'DISCREPANCY') trendsByDay[dateKey].discrepancy++;
    });

    return Object.values(trendsByDay).sort((a: any, b: any) => 
      a.date.localeCompare(b.date)
    );
  }

  /**
   * Get stock movement analysis
   */
  static async getStockMovementAnalysis(days: number = 30) {
    logger.info('Analyzing stock movement', { days });

    const since = new Date(Date.now() - days * DAY_MS);

    const sales = await prisma.saleEvent.findMany({
      where: { createdAt: { gte: since } },
      include: {
        product: {
          select: {
            sku: true,
            name: true,
            category: true
          }
        }
      }
    });

    // Calculate top selling products
    const productSales: { [sku: string]: any } = {};

    sales.forEach(sale => {
      if (!productSales[sale.product.sku]) {
        productSales[sale.product.sku] = {
          sku: sale.product.sku,
          name: sale.product.name,
          category: sale.product.category,
          totalSold: 0,
          transactionCount: 0
        };
      }

      productSales[sale.product.sku].totalSold += sale.quantity;
      productSales[sale.product.sku].transactionCount++;
    });

    const topSelling = Object.values(productSales)
      .sort((a: any, b: any) => b.totalSold - a.totalSold)
      .slice(0, 10);

    // Calculate sales by category
    const categorySales: { [category: string]: number } = {};

    sales.forEach(sale => {
      const category = sale.product.category || 'Uncategorized';
      categorySales[category] = (categorySales[category] || 0) + sale.quantity;
    });

    return {
      topSellingProducts: topSelling,
      salesByCategory: Object.entries(categorySales).map(([category, quantity]) => ({
        category,
        quantity
      }))
    };
  }

  /**
   * Get audit performance metrics
   */
  static async getAuditPerformance(days: number = 30) {
    logger.info('Calculating audit performance', { days });

    const since = new Date(Date.now() - days * DAY_MS);

    const [auditStats, shelfPerformance] = await Promise.all([
      prisma.auditLog.aggregate({
        where: { createdAt: { gte: since } },
        _count: true,
        _avg: {
          confidence: true,
          discrepancy: true
        }
      }),

      prisma.shelf.findMany({
        include: {
          auditLogs: {
            where: { createdAt: { gte: since } },
            select: {
              confidence: true,
              discrepancy: true,
              alertTriggered: true
            }
          },
        }
      })
    ]);

    const shelfStats = shelfPerformance.map(shelf => {
      const audits = shelf.auditLogs;
      const avgConfidence = audits.length > 0
        ? audits.reduce((sum, a) => sum + a.confidence, 0) / audits.length
        : 0;
      const avgDiscrepancy = audits.length > 0
        ? audits.reduce((sum, a) => sum + Math.abs(a.discrepancy), 0) / audits.length
        : 0;
      const alertRate = audits.length > 0
        ? audits.filter(a => a.alertTriggered).length / audits.length
        : 0;

      return {
        shelfLabel: shelf.label,
        zone: shelf.zone,
        auditCount: audits.length,
        avgConfidence: Number(avgConfidence.toFixed(2)),
        avgDiscrepancy: Number(avgDiscrepancy.toFixed(2)),
        alertRate: Number(alertRate.toFixed(2))
      };
    });

    return {
      overall: {
        totalAudits: auditStats._count,
        avgConfidence: auditStats._avg.confidence || 0,
        avgDiscrepancy: Number(Math.abs(auditStats._avg.discrepancy || 0).toFixed(2))
      },
      byShelf: shelfStats.sort((a, b) => b.auditCount - a.auditCount)
    };
  }

  /**
   * Get phantom stock hotspots
   */
  static async getPhantomStockHotspots(days: number = 30) {
    logger.info('Identifying phantom stock hotspots', { days });

    const since = new Date(Date.now() - days * DAY_MS);

    const phantomAlerts = await prisma.alert.findMany({
      where: {
        type: 'PHANTOM_STOCK',
        createdAt: { gte: since }
      },
      include: {
        product: {
          select: {
            sku: true,
            name: true,
            category: true,
            shelf: {
              select: {
                label: true,
                zone: true
              }
            }
          }
        }
      }
    });

    // Group by product
    const productHotspots: { [sku: string]: any } = {};

    phantomAlerts.forEach(alert => {
      const sku = alert.product?.sku;
      if (!sku) return;

      if (!productHotspots[sku]) {
        productHotspots[sku] = {
          sku,
          name: alert.product?.name,
          category: alert.product?.category,
          shelfLabel: alert.product?.shelf?.label,
          zone: alert.product?.shelf?.zone,
          incidents: 0
        };
      }

      productHotspots[sku].incidents++;
    });

    // Group by shelf
    const shelfHotspots: { [label: string]: any } = {};

    phantomAlerts.forEach(alert => {
      const label = alert.shelfLabel;
      if (!label) return;

      if (!shelfHotspots[label]) {
        shelfHotspots[label] = {
          shelfLabel: label,
          incidents: 0
        };
      }

      shelfHotspots[label].incidents++;
    });

    return {
      byProduct: Object.values(productHotspots)
        .sort((a: any, b: any) => b.incidents - a.incidents)
        .slice(0, 10),
      byShelf: Object.values(shelfHotspots)
        .sort((a: any, b: any) => b.incidents - a.incidents)
        .slice(0, 10)
    };
  }

  /**
   * Get system health metrics
   */
  static async getSystemHealth() {
    logger.info('Calculating system health metrics');

    const [
      recentWebhooks,
      recentAudits,
      openAlerts,
      recentErrors
    ] = await Promise.all([
      prisma.webhookLog.count({
        where: {
          createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) }, // Last hour
          processed: true
        }
      }),

      prisma.auditLog.count({
        where: {
          createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) },
          status: 'COMPLETED'
        }
      }),

      prisma.alert.count({
        where: {
          status: { in: ['OPEN', 'ACKNOWLEDGED'] },
          severity: 'CRITICAL'
        }
      }),

      prisma.webhookLog.count({
        where: {
          createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) },
          processed: false,
          error: { not: null }
        }
      })
    ]);

    return {
      webhooks: {
        processedLastHour: recentWebhooks,
        status: recentWebhooks > 0 ? 'healthy' : 'idle'
      },
      audits: {
        completedLastHour: recentAudits,
        status: recentAudits > 0 ? 'active' : 'idle'
      },
      alerts: {
        criticalOpen: openAlerts,
        status: openAlerts > 10 ? 'attention' : 'normal'
      },
      errors: {
        webhookFailuresLastHour: recentErrors,
        status: recentErrors > 5 ? 'unhealthy' : 'healthy'
      },
      overall: recentErrors > 5 || openAlerts > 10 ? 'needs-attention' : 'healthy'
    };
  }

  /**
   * Export analytics report
   */
  static async generateReport(days: number = 30) {
    logger.info('Generating comprehensive analytics report', { days });

    const [
      overview,
      alertTrends,
      stockMovement,
      auditPerformance,
      phantomHotspots,
      systemHealth
    ] = await Promise.all([
      AnalyticsService.getDashboardOverview(days),
      AnalyticsService.getAlertTrends(days),
      AnalyticsService.getStockMovementAnalysis(days),
      AnalyticsService.getAuditPerformance(days),
      AnalyticsService.getPhantomStockHotspots(days),
      AnalyticsService.getSystemHealth()
    ]);

    return {
      generatedAt: new Date(),
      period: `Last ${days} days`,
      overview,
      alertTrends,
      stockMovement,
      auditPerformance,
      phantomHotspots,
      systemHealth
    };
  }
}
