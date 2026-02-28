// src/controllers/productController.ts
import { Request, Response } from 'express';
import { ProductService } from '../services/productService';
import { asyncHandler } from '../middleware/errorHandler';
import { logger } from '../utils/logger';

export class ProductController {
  /**
   * POST /api/products
   * Create a new product
   */
  static createProduct = asyncHandler(async (req: Request, res: Response) => {
    const { sku, name, minThreshold, maxCapacity, price, category, imageUrl } = req.body;

    logger.info('Creating new product', { sku, name });

    const product = await ProductService.createProduct({
      sku,
      name,
      minThreshold,
      maxCapacity,
      price,
      category,
      imageUrl
    });

    return res.status(201).json({
      message: 'Product created successfully',
      data: product
    });
  });

  /**
   * PUT /api/products/:sku
   * Update a product
   */
  static updateProduct = asyncHandler(async (req: Request, res: Response) => {
    const { sku } = req.params;
    const updates = req.body;

    logger.info('Updating product', { sku });

    const product = await ProductService.updateProduct(sku, updates);

    return res.status(200).json({
      message: 'Product updated successfully',
      data: product
    });
  });

  /**
   * DELETE /api/products/:sku
   * Delete a product
   */
  static deleteProduct = asyncHandler(async (req: Request, res: Response) => {
    const { sku } = req.params;

    logger.info('Deleting product', { sku });

    await ProductService.deleteProduct(sku);

    return res.status(200).json({
      message: 'Product deleted successfully'
    });
  });

  /**
   * GET /api/products/:sku
   * Get product details
   */
  static getProduct = asyncHandler(async (req: Request, res: Response) => {
    const { sku } = req.params;

    logger.info('Fetching product', { sku });

    const product = await ProductService.getProductBySku(sku);

    if (!product) {
      return res.status(404).json({
        error: 'Product not found',
        sku
      });
    }

    return res.status(200).json({
      data: product
    });
  });

  /**
   * GET /api/products
   * List products with filtering
   */
  static listProducts = asyncHandler(async (req: Request, res: Response) => {
    const { category, shelfLabel, lowStock, limit, offset } = req.query;

    logger.info('Listing products', { category, shelfLabel, lowStock });

    const { products, total } = await ProductService.listProducts({
      category: category as string,
      shelfLabel: shelfLabel as string,
      lowStock: lowStock === 'true',
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined
    });

    return res.status(200).json({
      data: products,
      pagination: {
        total,
        limit: Number(limit) || 50,
        offset: Number(offset) || 0,
        hasMore: total > (Number(offset) || 0) + (Number(limit) || 50)
      }
    });
  });

  /**
   * GET /api/products/attention
   * Get products needing attention
   */
  static getProductsNeedingAttention = asyncHandler(async (req: Request, res: Response) => {
    logger.info('Fetching products needing attention');

    const products = await ProductService.getProductsNeedingAttention();

    return res.status(200).json({
      data: products,
      count: products.length
    });
  });

  /**
   * GET /api/products/summary
   * Get inventory summary
   */
  static getInventorySummary = asyncHandler(async (req: Request, res: Response) => {
    logger.info('Generating inventory summary');

    const summary = await ProductService.getInventorySummary();

    return res.status(200).json({
      data: summary
    });
  });

  /**
   * POST /api/products/bulk-update
   * Bulk update stock levels
   */
  static bulkUpdateStock = asyncHandler(async (req: Request, res: Response) => {
    const { updates } = req.body;

    if (!Array.isArray(updates)) {
      return res.status(400).json({
        error: 'Updates must be an array'
      });
    }

    logger.info('Performing bulk stock update', { count: updates.length });

    const result = await ProductService.bulkUpdateStock(updates);

    return res.status(200).json({
      message: 'Bulk update completed',
      data: result
    });
  });

  /**
   * POST /api/products/:sku/assign-shelf
   * Assign product to shelf
   */
  static assignToShelf = asyncHandler(async (req: Request, res: Response) => {
    const { sku } = req.params;
    const { shelfLabel } = req.body;

    if (!shelfLabel) {
      return res.status(400).json({
        error: 'shelfLabel is required'
      });
    }

    logger.info('Assigning product to shelf', { sku, shelfLabel });

    const product = await ProductService.assignToShelf(sku, shelfLabel);

    return res.status(200).json({
      message: 'Product assigned to shelf',
      data: product
    });
  });

  /**
   * GET /api/products/:sku/metrics
   * Get product performance metrics
   */
  static getProductMetrics = asyncHandler(async (req: Request, res: Response) => {
    const { sku } = req.params;
    const days = req.query.days ? Number(req.query.days) : 30;

    logger.info('Calculating product metrics', { sku, days });

    const metrics = await ProductService.getProductMetrics(sku, days);

    return res.status(200).json({
      data: metrics,
      period: `Last ${days} days`
    });
  });
}
