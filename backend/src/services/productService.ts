// src/services/productService.ts
import { PrismaClient, Product } from '@prisma/client';
import { logger } from '../utils/logger';
import { AppError } from '../middleware/errorHandler';

const prisma = new PrismaClient();

export class ProductService {
  /**
   * Create a new product
   */
  static async createProduct(data: {
    sku: string;
    name: string;
    minThreshold?: number;
    maxCapacity?: number;
    price?: number;
    category?: string;
    imageUrl?: string;
  }): Promise<Product> {
    logger.info('Creating product', { sku: data.sku, name: data.name });

    try {
      const product = await prisma.product.create({
        data: {
          sku: data.sku,
          name: data.name,
          stock: 0,
          minThreshold: data.minThreshold || 5,
          maxCapacity: data.maxCapacity || 100,
          price: data.price || 0,
          category: data.category,
          imageUrl: data.imageUrl,
        }
      });

      logger.info('Product created successfully', { 
        productId: product.id, 
        sku: product.sku 
      });

      return product;
    } catch (error: any) {
      logger.error('Failed to create product', { 
        error: error.message,
        sku: data.sku 
      });
      throw error;
    }
  }

  /**
   * Update product details
   */
  static async updateProduct(
    sku: string, 
    data: Partial<Product>
  ): Promise<Product> {
    logger.info('Updating product', { sku, updates: Object.keys(data) });

    try {
      const product = await prisma.product.update({
        where: { sku },
        data
      });

      logger.info('Product updated successfully', { 
        productId: product.id, 
        sku: product.sku 
      });

      return product;
    } catch (error: any) {
      logger.error('Failed to update product', { 
        error: error.message,
        sku 
      });
      throw error;
    }
  }

  /**
   * Delete a product
   */
  static async deleteProduct(sku: string): Promise<void> {
    logger.info('Deleting product', { sku });

    try {
      await prisma.product.delete({
        where: { sku }
      });

      logger.info('Product deleted successfully', { sku });
    } catch (error: any) {
      logger.error('Failed to delete product', { 
        error: error.message,
        sku 
      });
      throw error;
    }
  }

  /**
   * Get product by SKU
   */
  static async getProductBySku(sku: string): Promise<Product | null> {
    try {
      return await prisma.product.findUnique({
        where: { sku },
        include: {
          shelf: true,
          auditLogs: {
            orderBy: { createdAt: 'desc' },
            take: 5
          },
          salesEvents: {
            orderBy: { createdAt: 'desc' },
            take: 10
          }
        }
      });
    } catch (error: any) {
      logger.error('Failed to get product', { error: error.message, sku });
      throw error;
    }
  }

  /**
   * List all products with optional filtering
   */
  static async listProducts(filters?: {
    category?: string;
    shelfLabel?: string;
    lowStock?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<{ products: Product[]; total: number }> {
    const where: any = {};

    if (filters?.category) {
      where.category = filters.category;
    }

    if (filters?.shelfLabel) {
      where.shelf = { label: filters.shelfLabel };
    }

    if (filters?.lowStock) {
      where.stock = { lte: prisma.product.fields.minThreshold };
    }

    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where,
        include: {
          shelf: {
            select: {
              label: true,
              zone: true
            }
          }
        },
        take: filters?.limit || 50,
        skip: filters?.offset || 0,
        orderBy: { name: 'asc' }
      }),
      prisma.product.count({ where })
    ]);

    return { products, total };
  }

  /**
   * Get products requiring immediate attention
   */
  static async getProductsNeedingAttention(): Promise<Product[]> {
    logger.info('Fetching products needing attention');

    const products = await prisma.product.findMany({
      where: {
        OR: [
          // Low stock
          { stock: { lte: prisma.product.fields.minThreshold } },
          // Recent discrepancies
          {
            auditLogs: {
              some: {
                discrepancy: { gt: 3 },
                createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
              }
            }
          }
        ]
      },
      include: {
        shelf: true,
        auditLogs: {
          orderBy: { createdAt: 'desc' },
          take: 1
        }
      }
    });

    logger.info('Found products needing attention', { count: products.length });

    return products;
  }

  /**
   * Get inventory summary
   */
  static async getInventorySummary(): Promise<{
    totalProducts: number;
    totalStock: number;
    lowStockItems: number;
    outOfStockItems: number;
    overstockedItems: number;
    categories: Array<{ category: string; count: number }>;
  }> {
    logger.info('Generating inventory summary');

    const [
      totalProducts,
      totalStockResult,
      lowStockItems,
      outOfStockItems,
      overstockedItems,
      categories
    ] = await Promise.all([
      prisma.product.count(),
      
      prisma.product.aggregate({
        _sum: { stock: true }
      }),
      
      prisma.product.count({
        where: {
          AND: [
            { stock: { gt: 0 } },
            { stock: { lte: prisma.product.fields.minThreshold } }
          ]
        }
      }),
      
      prisma.product.count({
        where: { stock: 0 }
      }),
      
      prisma.product.count({
        where: { stock: { gt: prisma.product.fields.maxCapacity } }
      }),
      
      prisma.product.groupBy({
        by: ['category'],
        _count: true,
        where: { category: { not: null } }
      })
    ]);

    return {
      totalProducts,
      totalStock: totalStockResult._sum.stock || 0,
      lowStockItems,
      outOfStockItems,
      overstockedItems,
      categories: categories.map(c => ({
        category: c.category || 'Uncategorized',
        count: c._count
      }))
    };
  }

  /**
   * Bulk update stock levels (for inventory corrections)
   */
  static async bulkUpdateStock(
    updates: Array<{ sku: string; newStock: number; reason: string }>
  ): Promise<{ success: number; failed: number; errors: string[] }> {
    logger.info('Performing bulk stock update', { count: updates.length });

    let success = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const update of updates) {
      try {
        await prisma.product.update({
          where: { sku: update.sku },
          data: { stock: update.newStock }
        });

        // Log the manual adjustment
        logger.info('Stock manually adjusted', {
          sku: update.sku,
          newStock: update.newStock,
          reason: update.reason
        });

        success++;
      } catch (error: any) {
        failed++;
        errors.push(`${update.sku}: ${error.message}`);
        logger.error('Failed to update stock', {
          sku: update.sku,
          error: error.message
        });
      }
    }

    logger.info('Bulk update completed', { success, failed });

    return { success, failed, errors };
  }

  /**
   * Assign product to shelf
   */
  static async assignToShelf(sku: string, shelfLabel: string): Promise<Product> {
    logger.info('Assigning product to shelf', { sku, shelfLabel });

    return await prisma.$transaction(async (tx) => {
      // Find or create shelf
      const shelf = await tx.shelf.upsert({
        where: { label: shelfLabel },
        update: {},
        create: { 
          label: shelfLabel,
          lastScanned: new Date()
        }
      });

      // Update product
      const product = await tx.product.update({
        where: { sku },
        data: { shelfId: shelf.id },
        include: { shelf: true }
      });

      logger.info('Product assigned to shelf', {
        sku: product.sku,
        shelfLabel: shelf.label
      });

      return product;
    });
  }

  /**
   * Get product performance metrics
   */
  static async getProductMetrics(
    sku: string,
    days: number = 30
  ): Promise<{
    totalSales: number;
    averageDailySales: number;
    stockouts: number;
    lastRestockDate: Date | null;
    turnoverRate: number;
  }> {
    logger.info('Calculating product metrics', { sku, days });

    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const product = await prisma.product.findUnique({ where: { sku } });

    if (!product) {
      throw new AppError(404, 'Product not found');
    }

    const [salesData, stockouts] = await Promise.all([
      prisma.saleEvent.aggregate({
        where: {
          productId: product.id,
          createdAt: { gte: since }
        },
        _sum: { quantity: true }
      }),
      
      prisma.saleEvent.count({
        where: {
          productId: product.id,
          createdAt: { gte: since },
          stockAfter: 0
        }
      })
    ]);

    const totalSales = salesData._sum.quantity || 0;
    const averageDailySales = totalSales / days;
    const turnoverRate = product.stock > 0 ? totalSales / product.stock : 0;

    return {
      totalSales,
      averageDailySales: Number(averageDailySales.toFixed(2)),
      stockouts,
      lastRestockDate: null, // TODO: Track restock events
      turnoverRate: Number(turnoverRate.toFixed(2))
    };
  }
}
