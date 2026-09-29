// src/validation/schemas.ts
import { z } from 'zod';

const ALERT_TYPES = ['PHANTOM_STOCK', 'LOW_STOCK', 'OVERSTOCKED', 'MISPLACED', 'CAMERA_FAILURE', 'DISCREPANCY'] as const;
const ALERT_SEVERITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const;
const ALERT_STATUSES = ['OPEN', 'ACKNOWLEDGED', 'IN_PROGRESS', 'RESOLVED', 'DISMISSED'] as const;

// Multipart and query-string values arrive as strings.
const booleanish = z.preprocess(
  (v) => (typeof v === 'string' ? ['true', '1', 'on', 'yes'].includes(v.toLowerCase()) : v),
  z.boolean()
);

// Stock Management Schemas
export const AddStockSchema = z.object({
  sku: z.string().min(1, 'SKU is required'),
  quantity: z.coerce.number().int().positive('Quantity must be a positive integer'),
  shelfLabel: z.string().min(1, 'Shelf label is required'),
});

export const RecordSaleSchema = z.object({
  sku: z.string().min(1, 'SKU is required'),
  quantity: z.coerce.number().int().positive('Quantity must be positive'),
  orderId: z.string().optional(),
});

// Vision Audit Schemas
export const PerformAuditSchema = z.object({
  shelfLabel: z.string().min(1, 'Shelf label is required'),
  force: booleanish.optional().default(false), // Force audit even if recently done
});

// Webhook Schemas
export const PosWebhookSchema = z.object({
  event_type: z.enum(['order.completed', 'order.cancelled', 'order.refunded']),
  data: z.object({
    order_id: z.string().min(1),
    line_items: z
      .array(
        z.object({
          sku: z.string().min(1),
          quantity: z.number().int().positive(),
          price: z.number().optional(),
        })
      )
      .min(1),
    timestamp: z.string().datetime().optional(),
  }),
});

// Alert Management Schemas
export const AlertQuerySchema = z.object({
  severity: z.enum(ALERT_SEVERITIES).optional(),
  status: z.enum(ALERT_STATUSES).optional(),
  // Comma-separated statuses, e.g. "OPEN,ACKNOWLEDGED"
  statuses: z
    .string()
    .transform((s) => s.split(',').map((x) => x.trim()).filter(Boolean))
    .pipe(z.array(z.enum(ALERT_STATUSES)))
    .optional(),
  shelfLabel: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export const AcknowledgeAlertSchema = z.object({
  acknowledgedBy: z.string().min(1).optional(),
});

export const ResolveAlertSchema = z.object({
  resolvedBy: z.string().min(1, 'resolvedBy is required'),
  resolution: z.string().min(10, 'Resolution notes must be at least 10 characters'),
  dismiss: z.boolean().optional(), // close as a false positive instead of resolved
});

export const CreateAlertSchema = z.object({
  productId: z.string().min(1),
  shelfLabel: z.string(),
  type: z.enum(ALERT_TYPES),
  severity: z.enum(ALERT_SEVERITIES),
  message: z.string(),
});

// Configuration Schemas
export const UpdateShelfConfigSchema = z
  .object({
    phantomStockThreshold: z.number().int().min(0),
    lowStockThreshold: z.number().int().min(0),
    checkIntervalMinutes: z.number().int().positive(),
    salesTriggerCount: z.number().int().positive(),
    enableSlack: z.boolean(),
    enableSms: z.boolean(),
    enableEmail: z.boolean(),
  })
  .partial()
  .strict();

// Shelf Management Schemas
export const CreateShelfSchema = z.object({
  label: z.string().min(1, 'Shelf label is required'),
  zone: z.string().optional(),
  cameraUrl: z.string().optional(),
  posX: z.number().optional(),
  posY: z.number().optional(),
});

export const UpdateShelfSchema = z
  .object({
    zone: z.string().nullable(),
    cameraUrl: z.string().nullable(),
    posX: z.number().nullable(),
    posY: z.number().nullable(),
  })
  .partial()
  .strict();

// Product Management Schemas
export const CreateProductSchema = z.object({
  sku: z.string().min(1),
  name: z.string().min(1),
  minThreshold: z.number().int().min(0).default(5),
  maxCapacity: z.number().int().positive().default(100),
  price: z.number().min(0).optional(),
  category: z.string().optional(),
  imageUrl: z.string().url().optional(),
  shelfLabel: z.string().min(1).optional(),
});

// SKU comes from the URL and stock only changes through stock endpoints,
// so neither is updatable here.
export const UpdateProductSchema = CreateProductSchema.omit({ sku: true, shelfLabel: true })
  .extend({ category: z.string().nullable(), imageUrl: z.string().url().nullable() })
  .partial()
  .strict();

export const AssignShelfSchema = z.object({
  shelfLabel: z.string().min(1, 'shelfLabel is required'),
});

export const BulkUpdateStockSchema = z.object({
  updates: z
    .array(
      z.object({
        sku: z.string().min(1),
        newStock: z.number().int().min(0),
        reason: z.string().min(1),
      })
    )
    .min(1)
    .max(500),
});

// Floor plan
export const FloorPlanSchema = z.object({
  walls: z.array(
    z.object({ id: z.string(), x1: z.number(), y1: z.number(), x2: z.number(), y2: z.number() })
  ),
  points: z.array(
    z.object({
      id: z.string(),
      type: z.enum(['camera', 'entrance', 'checkout']),
      label: z.string(),
      x: z.number(),
      y: z.number(),
      cameraUrl: z.string().optional(),
    })
  ),
  shelves: z
    .array(z.object({ label: z.string(), x: z.number(), y: z.number() }))
    .optional(),
});

// Type exports
export type AddStockInput = z.infer<typeof AddStockSchema>;
export type RecordSaleInput = z.infer<typeof RecordSaleSchema>;
export type PerformAuditInput = z.infer<typeof PerformAuditSchema>;
export type PosWebhookInput = z.infer<typeof PosWebhookSchema>;
export type ResolveAlertInput = z.infer<typeof ResolveAlertSchema>;
export type CreateAlertInput = z.infer<typeof CreateAlertSchema>;
export type UpdateShelfConfigInput = z.infer<typeof UpdateShelfConfigSchema>;
export type CreateShelfInput = z.infer<typeof CreateShelfSchema>;
export type UpdateShelfInput = z.infer<typeof UpdateShelfSchema>;
export type CreateProductInput = z.infer<typeof CreateProductSchema>;
export type UpdateProductInput = z.infer<typeof UpdateProductSchema>;
export type FloorPlanInput = z.infer<typeof FloorPlanSchema>;
