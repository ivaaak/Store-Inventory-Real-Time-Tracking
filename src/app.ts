// src/app.ts
import express from 'express';
import multer from 'multer';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { InventoryController } from './controllers/inventoryController';
import { VisionController } from './controllers/visionController';
import { AlertController } from './controllers/alertController';
import { ProductController } from './controllers/productController';
import { ShelfController } from './controllers/shelfController';
import { AnalyticsController } from './controllers/analyticsController';
import { WebhookHandler } from './webhooks/webhookHandler';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { validateBody, validateMultipart } from './middleware/validation';
import {
    AddStockSchema,
    RecordSaleSchema,
    PerformAuditSchema,
    ResolveAlertSchema,
    CreateProductSchema,
    UpdateProductSchema
} from './validation/schemas';
import { logStream, logger } from './utils/logger';

const app = express();

// ===== Security Middleware =====
app.use(helmet()); // Security headers
app.use(cors({
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true
}));

// ===== Rate Limiting =====
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', limiter);

// Webhook-specific rate limiter (more permissive)
const webhookLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 60, // 60 requests per minute for webhooks
    skipSuccessfulRequests: true
});

// ===== Request Parsing =====
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ===== Logging =====
app.use(morgan('combined', { stream: logStream }));

// ===== Correlation ID Middleware =====
app.use((req, res, next) => {
    req.headers['x-correlation-id'] =
        req.headers['x-correlation-id'] ||
        `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    next();
});

// ===== File Upload Configuration =====
const upload = multer({
    dest: 'uploads/',
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB max
    },
    fileFilter: (req, file, cb) => {
        // Only allow images
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed'));
        }
    }
});

// ===== Health Check =====
app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        service: 'shelf-monitoring-api'
    });
});

// ===== Inventory Routes =====
app.post(
    '/api/stock/add',
    validateBody(AddStockSchema),
    InventoryController.addStock
);

app.post(
    '/api/stock/sale',
    validateBody(RecordSaleSchema),
    InventoryController.recordSale
);

app.get(
    '/api/stock/:sku',
    InventoryController.getStock
);

app.get(
    '/api/stock/:sku/velocity',
    InventoryController.getSalesVelocity
);

// ===== Vision/AI Routes =====
app.post(
    '/api/vision/audit',
    upload.single('image'),
    validateMultipart(PerformAuditSchema),
    VisionController.performAudit
);

app.get(
    '/api/vision/history/:shelfLabel',
    VisionController.getAuditHistory
);

// ===== Alert Routes =====
app.get(
    '/api/alerts',
    AlertController.getAlerts
);

app.get(
    '/api/alerts/stats',
    AlertController.getAlertStats
);

app.post(
    '/api/alerts/:alertId/acknowledge',
    AlertController.acknowledgeAlert
);

app.post(
    '/api/alerts/:alertId/resolve',
    validateBody(ResolveAlertSchema),
    AlertController.resolveAlert
);

// ===== Webhook Routes =====
app.post(
    '/api/webhooks/pos-sale',
    webhookLimiter,
    WebhookHandler.handlePosSale
);

app.get(
    '/api/webhooks/health',
    WebhookHandler.healthCheck
);

// ===== Configuration Routes =====
app.get(
    '/api/config/shelf/:shelfLabel',
    AlertController.getShelfConfig
);

app.post(
    '/api/config/shelf/:shelfLabel',
    AlertController.updateShelfConfig
);

// ===== Product Management Routes =====
app.post(
    '/api/products',
    validateBody(CreateProductSchema),
    ProductController.createProduct
);

app.get(
    '/api/products',
    ProductController.listProducts
);

app.get(
    '/api/products/attention',
    ProductController.getProductsNeedingAttention
);

app.get(
    '/api/products/summary',
    ProductController.getInventorySummary
);

app.get(
    '/api/products/:sku',
    ProductController.getProduct
);

app.put(
    '/api/products/:sku',
    validateBody(UpdateProductSchema),
    ProductController.updateProduct
);

app.delete(
    '/api/products/:sku',
    ProductController.deleteProduct
);

app.post(
    '/api/products/bulk-update',
    ProductController.bulkUpdateStock
);

app.post(
    '/api/products/:sku/assign-shelf',
    ProductController.assignToShelf
);

app.get(
    '/api/products/:sku/metrics',
    ProductController.getProductMetrics
);

// ===== Shelf Management Routes =====
app.post(
    '/api/shelves',
    ShelfController.createShelf
);

app.get(
    '/api/shelves',
    ShelfController.listShelves
);

app.get(
    '/api/shelves/audit/due',
    ShelfController.getShelvesDueForAudit
);

app.get(
    '/api/shelves/zones',
    ShelfController.getZones
);

app.get(
    '/api/shelves/:label',
    ShelfController.getShelf
);

app.put(
    '/api/shelves/:label',
    ShelfController.updateShelf
);

app.delete(
    '/api/shelves/:label',
    ShelfController.deleteShelf
);

app.get(
    '/api/shelves/:label/config',
    ShelfController.getShelfConfig
);

app.post(
    '/api/shelves/:label/config',
    ShelfController.updateShelfConfig
);

app.get(
    '/api/shelves/:label/metrics',
    ShelfController.getShelfMetrics
);

app.get(
    '/api/shelves/:label/capacity',
    ShelfController.getCapacityUtilization
);

app.post(
    '/api/shelves/:label/schedule-audit',
    ShelfController.scheduleAudit
);

// ===== Analytics Routes =====
app.get(
    '/api/analytics/dashboard',
    AnalyticsController.getDashboardOverview
);

app.get(
    '/api/analytics/alert-trends',
    AnalyticsController.getAlertTrends
);

app.get(
    '/api/analytics/stock-movement',
    AnalyticsController.getStockMovement
);

app.get(
    '/api/analytics/audit-performance',
    AnalyticsController.getAuditPerformance
);

app.get(
    '/api/analytics/phantom-hotspots',
    AnalyticsController.getPhantomHotspots
);

app.get(
    '/api/analytics/system-health',
    AnalyticsController.getSystemHealth
);

app.get(
    '/api/analytics/report',
    AnalyticsController.generateReport
);

// ===== Error Handling =====
app.use(notFoundHandler);
app.use(errorHandler);

// ===== Graceful Shutdown =====
process.on('SIGTERM', () => {
    logger.info('SIGTERM signal received: closing HTTP server');
    process.exit(0);
});

process.on('SIGINT', () => {
    logger.info('SIGINT signal received: closing HTTP server');
    process.exit(0);
});

export default app;