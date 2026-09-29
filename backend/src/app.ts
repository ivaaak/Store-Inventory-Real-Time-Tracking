// src/app.ts
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import express from 'express';
import multer from 'multer';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { prisma } from './lib/prisma';
import { eventStream } from './lib/events';
import { InventoryController } from './controllers/inventoryController';
import { VisionController } from './controllers/visionController';
import { AlertController } from './controllers/alertController';
import { ProductController } from './controllers/productController';
import { ShelfController } from './controllers/shelfController';
import { AnalyticsController } from './controllers/analyticsController';
import { FloorPlanController } from './controllers/floorPlanController';
import { WebhookHandler } from './webhooks/webhookHandler';
import { asyncHandler, errorHandler, notFoundHandler } from './middleware/errorHandler';
import { validateBody, validateQuery } from './middleware/validation';
import {
  AddStockSchema,
  RecordSaleSchema,
  PerformAuditSchema,
  AlertQuerySchema,
  AcknowledgeAlertSchema,
  ResolveAlertSchema,
  CreateProductSchema,
  UpdateProductSchema,
  AssignShelfSchema,
  BulkUpdateStockSchema,
  CreateShelfSchema,
  UpdateShelfSchema,
  UpdateShelfConfigSchema,
  FloorPlanSchema,
} from './validation/schemas';
import { logStream } from './utils/logger';

export const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const app = express();
app.set('trust proxy', 1);

// ===== Security Middleware =====
app.use(
  helmet({
    // Uploaded shelf images are displayed by the dashboard on another origin in dev.
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

// CORS_ORIGIN is a comma-separated allow-list. A wildcard cannot be combined
// with credentials, so '*' disables credentials.
const corsOrigins = (process.env.CORS_ORIGIN || 'http://localhost:3001')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);
const allowAnyOrigin = corsOrigins.includes('*');
app.use(
  cors({
    origin: allowAnyOrigin ? '*' : corsOrigins,
    credentials: !allowAnyOrigin,
  })
);

// ===== Rate Limiting =====
// Dashboards refetch on live events, so the general limit is generous.
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_MAX) || 2000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests from this IP, please try again later.' },
  skip: (req) => req.path === '/events' || req.path.startsWith('/webhooks/'),
});
app.use('/api/', apiLimiter);

const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
});

// Vision calls are slow and cost money.
const visionLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many audits, please wait a minute.' },
});

// ===== Request Parsing =====
app.use(
  express.json({
    limit: '1mb',
    // Keep the raw bytes for webhook HMAC verification.
    verify: (req, _res, buf) => {
      (req as express.Request).rawBody = buf;
    },
  })
);
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// ===== Correlation ID =====
app.use((req, res, next) => {
  const id = (req.headers['x-correlation-id'] as string) || crypto.randomUUID();
  req.headers['x-correlation-id'] = id;
  res.setHeader('x-correlation-id', id);
  next();
});

// ===== Logging =====
app.use(
  morgan(':method :url :status :res[content-length] - :response-time ms', {
    stream: logStream,
    skip: (req) => req.url === '/health' || req.url === '/api/events',
  })
);

// ===== File Upload Configuration =====
const IMAGE_EXTENSIONS: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (_req, file, cb) => cb(null, `${Date.now()}-${crypto.randomUUID()}${IMAGE_EXTENSIONS[file.mimetype]}`),
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (IMAGE_EXTENSIONS[file.mimetype]) cb(null, true);
    else cb(new Error('Only image files are allowed'));
  },
});

app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '7d', immutable: true, index: false }));

// ===== Health Check =====
app.get(
  '/health',
  asyncHandler(async (_req, res) => {
    let database = 'ok';
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch {
      database = 'unreachable';
    }
    res.status(database === 'ok' ? 200 : 503).json({
      status: database === 'ok' ? 'OK' : 'DEGRADED',
      database,
      timestamp: new Date().toISOString(),
      service: 'shelf-monitoring-api',
    });
  })
);

// ===== Live Events (SSE) =====
app.get('/api/events', eventStream);

// ===== Inventory Routes =====
app.post('/api/stock/add', validateBody(AddStockSchema), InventoryController.addStock);
app.post('/api/stock/sale', validateBody(RecordSaleSchema), InventoryController.recordSale);
app.get('/api/stock/:sku', InventoryController.getStock);
app.get('/api/stock/:sku/velocity', InventoryController.getSalesVelocity);

// ===== Vision/AI Routes =====
app.get('/api/vision/status', VisionController.getStatus);
app.post(
  '/api/vision/audit',
  visionLimiter,
  upload.single('image'),
  validateBody(PerformAuditSchema),
  VisionController.performAudit
);
app.get('/api/vision/audits', VisionController.getRecentAudits);
app.get('/api/vision/history/:shelfLabel', VisionController.getAuditHistory);

// ===== Alert Routes =====
app.get('/api/alerts', validateQuery(AlertQuerySchema), AlertController.getAlerts);
app.get('/api/alerts/stats', AlertController.getAlertStats);
app.post('/api/alerts/:alertId/acknowledge', validateBody(AcknowledgeAlertSchema), AlertController.acknowledgeAlert);
app.post('/api/alerts/:alertId/resolve', validateBody(ResolveAlertSchema), AlertController.resolveAlert);

// ===== Webhook Routes =====
app.post('/api/webhooks/pos-sale', webhookLimiter, asyncHandler(WebhookHandler.handlePosSale));
app.get('/api/webhooks/health', asyncHandler(WebhookHandler.healthCheck));

// ===== Configuration Routes =====
// Legacy aliases of /api/shelves/:label/config, kept for existing clients.
app.get('/api/config/shelf/:label', ShelfController.getShelfConfig);
app.post('/api/config/shelf/:label', validateBody(UpdateShelfConfigSchema), ShelfController.updateShelfConfig);

// ===== Product Management Routes =====
// Static paths are registered before /:sku so they are not captured by it.
app.post('/api/products', validateBody(CreateProductSchema), ProductController.createProduct);
app.get('/api/products', ProductController.listProducts);
app.get('/api/products/attention', ProductController.getProductsNeedingAttention);
app.get('/api/products/summary', ProductController.getInventorySummary);
app.post('/api/products/bulk-update', validateBody(BulkUpdateStockSchema), ProductController.bulkUpdateStock);
app.get('/api/products/:sku', ProductController.getProduct);
app.put('/api/products/:sku', validateBody(UpdateProductSchema), ProductController.updateProduct);
app.delete('/api/products/:sku', ProductController.deleteProduct);
app.post('/api/products/:sku/assign-shelf', validateBody(AssignShelfSchema), ProductController.assignToShelf);
app.get('/api/products/:sku/metrics', ProductController.getProductMetrics);

// ===== Shelf Management Routes =====
app.post('/api/shelves', validateBody(CreateShelfSchema), ShelfController.createShelf);
app.get('/api/shelves', ShelfController.listShelves);
app.get('/api/shelves/audit/due', ShelfController.getShelvesDueForAudit);
app.get('/api/shelves/zones', ShelfController.getZones);
app.get('/api/shelves/:label', ShelfController.getShelf);
app.put('/api/shelves/:label', validateBody(UpdateShelfSchema), ShelfController.updateShelf);
app.delete('/api/shelves/:label', ShelfController.deleteShelf);
app.get('/api/shelves/:label/config', ShelfController.getShelfConfig);
app.post('/api/shelves/:label/config', validateBody(UpdateShelfConfigSchema), ShelfController.updateShelfConfig);
app.get('/api/shelves/:label/metrics', ShelfController.getShelfMetrics);
app.get('/api/shelves/:label/capacity', ShelfController.getCapacityUtilization);
app.post('/api/shelves/:label/schedule-audit', ShelfController.scheduleAudit);

// ===== Floor Plan Routes =====
app.get('/api/floor-plan', FloorPlanController.getFloorPlan);
app.put('/api/floor-plan', validateBody(FloorPlanSchema), FloorPlanController.saveFloorPlan);

// ===== Analytics Routes =====
app.get('/api/analytics/dashboard', AnalyticsController.getDashboardOverview);
app.get('/api/analytics/alert-trends', AnalyticsController.getAlertTrends);
app.get('/api/analytics/stock-movement', AnalyticsController.getStockMovement);
app.get('/api/analytics/audit-performance', AnalyticsController.getAuditPerformance);
app.get('/api/analytics/phantom-hotspots', AnalyticsController.getPhantomHotspots);
app.get('/api/analytics/system-health', AnalyticsController.getSystemHealth);
app.get('/api/analytics/report', AnalyticsController.generateReport);

// ===== Error Handling =====
app.use(notFoundHandler);
app.use(errorHandler);

// Signal handling lives in server.ts so shutdown can drain connections.

export default app;
