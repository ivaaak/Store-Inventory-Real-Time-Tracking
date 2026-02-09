// src/validation/schemas.ts
import { z } from 'zod';

// Stock Management Schemas
export const AddStockSchema = z.object({
  sku: z.string().min(1, "SKU is required"),
  quantity: z.number().int().positive("Quantity must be a positive integer"),
  shelfLabel: z.string().min(1, "Shelf label is required"),
});

export const RecordSaleSchema = z.object({
  sku: z.string().min(1, "SKU is required"),
  quantity: z.number().int().positive("Quantity must be positive"),
  orderId: z.string().optional(),
});

// Vision Audit Schemas
export const PerformAuditSchema = z.object({
  shelfLabel: z.string().min(1, "Shelf label is required"),
  force: z.boolean().optional().default(false), // Force audit even if recently done
});

// Webhook Schemas
export const PosWebhookSchema = z.object({
  event_type: z.enum(['order.completed', 'order.cancelled', 'order.refunded']),
  data: z.object({
    order_id: z.string(),
    line_items: z.array(z.object({
      sku: z.string(),
      quantity: z.number().int().positive(),
      price: z.number().optional(),
    })),
    timestamp: z.string().datetime().optional(),
  }),
  signature: z.string().optional(),
});

// Alert Management Schemas
export const ResolveAlertSchema = z.object({
  alertId: z.string().cuid(),
  resolvedBy: z.string(),
  resolution: z.string().min(10, "Resolution notes must be at least 10 characters"),
});

export const CreateAlertSchema = z.object({
  productId: z.string().cuid(),
  shelfLabel: z.string(),
  type: z.enum(['PHANTOM_STOCK', 'LOW_STOCK', 'OVERSTOCKED', 'MISPLACED', 'CAMERA_FAILURE', 'DISCREPANCY']),
  severity: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']),
  message: z.string(),
});

// Configuration Schemas
export const UpdateShelfConfigSchema = z.object({
  shelfLabel: z.string(),
  phantomStockThreshold: z.number().int().positive().optional(),
  lowStockThreshold: z.number().int().positive().optional(),
  checkIntervalMinutes: z.number().int().positive().optional(),
  salesTriggerCount: z.number().int().positive().optional(),
  enableSlack: z.boolean().optional(),
  enableSms: z.boolean().optional(),
  enableEmail: z.boolean().optional(),
});

// Product Management Schemas
export const CreateProductSchema = z.object({
  sku: z.string().min(1),
  name: z.string().min(1),
  minThreshold: z.number().int().positive().default(5),
  maxCapacity: z.number().int().positive().default(100),
  price: z.number().positive().optional(),
  category: z.string().optional(),
  imageUrl: z.string().url().optional(),
});

export const UpdateProductSchema = CreateProductSchema.partial().extend({
  sku: z.string().min(1), // SKU is required for updates
});

// Type exports
export type AddStockInput = z.infer<typeof AddStockSchema>;
export type RecordSaleInput = z.infer<typeof RecordSaleSchema>;
export type PerformAuditInput = z.infer<typeof PerformAuditSchema>;
export type PosWebhookInput = z.infer<typeof PosWebhookSchema>;
export type ResolveAlertInput = z.infer<typeof ResolveAlertSchema>;
export type CreateAlertInput = z.infer<typeof CreateAlertSchema>;
export type UpdateShelfConfigInput = z.infer<typeof UpdateShelfConfigSchema>;
export type CreateProductInput = z.infer<typeof CreateProductSchema>;
export type UpdateProductInput = z.infer<typeof UpdateProductSchema>;
