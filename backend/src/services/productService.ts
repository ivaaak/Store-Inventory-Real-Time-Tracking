// src/services/productService.ts
import { Prisma, Product } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { publish } from '../lib/events';
import { logger } from '../utils/logger';
import { AppError } from '../middleware/errorHandler';
import { CreateProductInput, UpdateProductInput } from '../validation/schemas';

export type StockStatus = 'OUT' | 'LOW' | 'OK' | 'OVER';

export const stockStatus = (p: Pick<Product, 'stock' | 'minThreshold' | 'maxCapacity'>): StockStatus => {
  if (p.stock === 0) return 'OUT';
  if (p.stock <= p.minThreshold) return 'LOW';
  if (p.stock > p.maxCapacity) return 'OVER';
  return 'OK';
};

export class ProductService {
  /**
   * Create a new product, optionally placing it on a shelf.
   */
  static async createProduct(data: CreateProductInput): Promise<Product> {
    const product = await prisma.product.create({
      data: {
        sku: data.sku,
        name: data.name,
        stock: 0,
        minThreshold: data.minThreshold,
        maxCapacity: data.maxCapacity,
        price: data.price ?? 0,
        category: data.category,
        imageUrl: data.imageUrl,
        ...(data.shelfLabel && {
          shelf: {
            connectOrCreate: { where: { label: data.shelfLabel }, create: { label: data.shelfLabel } },
          },
        }),
      },
    });

    logger.info('Product created', { productId: product.id, sku: product.sku });
    return product;
  }

  /**
   * Update product details (not stock — use the stock endpoints for that).
   */
  static async updateProduct(sku: string, data: UpdateProductInput): Promise<Product> {
    const product = await prisma.product.update({ where: { sku }, data });
    logger.info('Product updated', { sku, fields: Object.keys(data) });
    return product;
  }

  static async deleteProduct(sku: string): Promise<void> {
    await prisma.product.delete({ where: { sku } });
    logger.info('Product deleted', { sku });
  }

  static async getProductBySku(sku: string) {
    const product = await prisma.product.findUnique({
      where: { sku },
      include: {
        shelf: true,
        auditLogs: { orderBy: { createdAt: 'desc' }, take: 5 },
        salesEvents: { orderBy: { createdAt: 'desc' }, take: 10 },
        alerts: {
          where: { status: { in: ['OPEN', 'ACKNOWLEDGED', 'IN_PROGRESS'] } },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    return product && { ...product, status: stockStatus(product) };
  }

  /**
   * List products with optional filtering
   */
  static async listProducts(filters: {
    q?: string;
    category?: string;
    shelfLabel?: string;
    lowStock?: boolean;
    limit?: number;
    offset?: number;
  } = {}) {
    const where: Prisma.ProductWhereInput = {};

    if (filters.q) {
      where.OR = [
        { sku: { contains: filters.q, mode: 'insensitive' } },
        { name: { contains: filters.q, mode: 'insensitive' } },
        { shelf: { label: { contains: filters.q, mode: 'insensitive' } } },
      ];
    }
    if (filters.category) where.category = filters.category;
    if (filters.shelfLabel) where.shelf = { label: filters.shelfLabel };
    if (filters.lowStock) where.stock = { lte: prisma.product.fields.minThreshold };

    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where,
        include: {
          shelf: { select: { label: true, zone: true } },
          auditLogs: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: { createdAt: true, visualCount: true, confidence: true, discrepancy: true },
          },
        },
        take: filters.limit ?? 50,
        skip: filters.offset ?? 0,
        orderBy: { name: 'asc' },
      }),
      prisma.product.count({ where }),
    ]);

    return {
      products: products.map(({ auditLogs, ...p }) => ({
        ...p,
        status: stockStatus(p),
        lastAudit: auditLogs[0] ?? null,
      })),
      total,
    };
  }

  /**
   * Products requiring immediate attention: low stock or a recent large discrepancy.
   */
  static async getProductsNeedingAttention() {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    return prisma.product.findMany({
      where: {
        OR: [
          { stock: { lte: prisma.product.fields.minThreshold } },
          {
            auditLogs: {
              some: {
                createdAt: { gte: since },
                OR: [{ discrepancy: { gt: 3 } }, { discrepancy: { lt: -3 } }],
              },
            },
          },
        ],
      },
      include: {
        shelf: true,
        auditLogs: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });
  }

  static async getInventorySummary() {
    const [products, categories] = await Promise.all([
      prisma.product.findMany({ select: { stock: true, price: true, minThreshold: true, maxCapacity: true } }),
      prisma.product.groupBy({ by: ['category'], _count: true, where: { category: { not: null } } }),
    ]);

    const counts = { OUT: 0, LOW: 0, OK: 0, OVER: 0 };
    let totalStock = 0;
    let stockValue = 0;
    for (const p of products) {
      counts[stockStatus(p)]++;
      totalStock += p.stock;
      stockValue += p.stock * Number(p.price);
    }

    return {
      totalProducts: products.length,
      totalStock,
      stockValue: Number(stockValue.toFixed(2)),
      inStockItems: counts.OK,
      lowStockItems: counts.LOW,
      outOfStockItems: counts.OUT,
      overstockedItems: counts.OVER,
      categories: categories.map((c) => ({ category: c.category || 'Uncategorized', count: c._count })),
    };
  }

  /**
   * Bulk stock correction, e.g. after a manual count.
   */
  static async bulkUpdateStock(updates: Array<{ sku: string; newStock: number; reason: string }>) {
    let success = 0;
    const errors: string[] = [];

    for (const update of updates) {
      try {
        const product = await prisma.product.update({
          where: { sku: update.sku },
          data: { stock: update.newStock },
        });
        logger.info('Stock manually adjusted', update);
        publish({ type: 'stock.changed', sku: product.sku, stock: product.stock, reason: 'adjustment' });
        success++;
      } catch (error: any) {
        const reason = error?.code === 'P2025' ? 'not found' : error.message;
        errors.push(`${update.sku}: ${reason}`);
      }
    }

    return { success, failed: errors.length, errors };
  }

  static async assignToShelf(sku: string, shelfLabel: string) {
    const product = await prisma.product.update({
      where: { sku },
      data: {
        shelf: { connectOrCreate: { where: { label: shelfLabel }, create: { label: shelfLabel } } },
      },
      include: { shelf: true },
    });
    publish({ type: 'shelf.changed', label: shelfLabel });
    return product;
  }

  static async getProductMetrics(sku: string, days: number = 30) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const product = await prisma.product.findUnique({ where: { sku } });
    if (!product) throw new AppError(404, 'Product not found');

    const [salesData, stockouts] = await Promise.all([
      prisma.saleEvent.aggregate({
        where: { productId: product.id, createdAt: { gte: since } },
        _sum: { quantity: true },
      }),
      prisma.saleEvent.count({
        where: { productId: product.id, createdAt: { gte: since }, stockAfter: 0 },
      }),
    ]);

    const totalSales = salesData._sum.quantity || 0;
    const averageDailySales = totalSales / days;

    return {
      totalSales,
      averageDailySales: Number(averageDailySales.toFixed(2)),
      stockouts,
      // Days of cover at the current sales rate; null when nothing sold.
      daysOfCover: averageDailySales > 0 ? Number((product.stock / averageDailySales).toFixed(1)) : null,
      turnoverRate: product.stock > 0 ? Number((totalSales / product.stock).toFixed(2)) : 0,
    };
  }
}
