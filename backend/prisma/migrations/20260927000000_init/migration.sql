-- CreateEnum
CREATE TYPE "AuditStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED', 'REVIEWING');

-- CreateEnum
CREATE TYPE "AlertType" AS ENUM ('PHANTOM_STOCK', 'LOW_STOCK', 'OVERSTOCKED', 'MISPLACED', 'CAMERA_FAILURE', 'DISCREPANCY');

-- CreateEnum
CREATE TYPE "AlertSeverity" AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "AlertStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'IN_PROGRESS', 'RESOLVED', 'DISMISSED');

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "stock" INTEGER NOT NULL DEFAULT 0,
    "minThreshold" INTEGER NOT NULL DEFAULT 5,
    "maxCapacity" INTEGER NOT NULL DEFAULT 100,
    "price" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "category" TEXT,
    "imageUrl" TEXT,
    "shelfId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shelf" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "zone" TEXT,
    "cameraUrl" TEXT,
    "lastScanned" TIMESTAMP(3),
    "posX" DOUBLE PRECISION,
    "posY" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shelf_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "shelfId" TEXT NOT NULL,
    "systemCount" INTEGER NOT NULL,
    "visualCount" INTEGER NOT NULL,
    "discrepancy" INTEGER NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" "AuditStatus" NOT NULL DEFAULT 'PENDING',
    "imageUrl" TEXT,
    "rawAiOutput" TEXT,
    "alertTriggered" BOOLEAN NOT NULL DEFAULT false,
    "alertType" "AlertType",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SaleEvent" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "orderId" TEXT,
    "stockBefore" INTEGER NOT NULL,
    "stockAfter" INTEGER NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'POS',
    "webhookId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SaleEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Alert" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "shelfLabel" TEXT NOT NULL,
    "type" "AlertType" NOT NULL,
    "severity" "AlertSeverity" NOT NULL,
    "message" TEXT NOT NULL,
    "status" "AlertStatus" NOT NULL DEFAULT 'OPEN',
    "acknowledgedAt" TIMESTAMP(3),
    "acknowledgedBy" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,
    "resolution" TEXT,
    "notificationsSent" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Alert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShelfAlertConfig" (
    "id" TEXT NOT NULL,
    "shelfId" TEXT NOT NULL,
    "phantomStockThreshold" INTEGER NOT NULL DEFAULT 5,
    "lowStockThreshold" INTEGER NOT NULL DEFAULT 3,
    "checkIntervalMinutes" INTEGER NOT NULL DEFAULT 30,
    "salesTriggerCount" INTEGER NOT NULL DEFAULT 10,
    "enableSlack" BOOLEAN NOT NULL DEFAULT true,
    "enableSms" BOOLEAN NOT NULL DEFAULT false,
    "enableEmail" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShelfAlertConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookLog" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "signature" TEXT,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "WebhookLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FloorPlan" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "layout" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FloorPlan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Product_sku_key" ON "Product"("sku");

-- CreateIndex
CREATE INDEX "Product_sku_idx" ON "Product"("sku");

-- CreateIndex
CREATE INDEX "Product_shelfId_idx" ON "Product"("shelfId");

-- CreateIndex
CREATE INDEX "Product_stock_idx" ON "Product"("stock");

-- CreateIndex
CREATE UNIQUE INDEX "Shelf_label_key" ON "Shelf"("label");

-- CreateIndex
CREATE INDEX "Shelf_label_idx" ON "Shelf"("label");

-- CreateIndex
CREATE INDEX "AuditLog_productId_createdAt_idx" ON "AuditLog"("productId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_shelfId_createdAt_idx" ON "AuditLog"("shelfId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_status_idx" ON "AuditLog"("status");

-- CreateIndex
CREATE INDEX "AuditLog_alertTriggered_idx" ON "AuditLog"("alertTriggered");

-- CreateIndex
CREATE INDEX "SaleEvent_productId_createdAt_idx" ON "SaleEvent"("productId", "createdAt");

-- CreateIndex
CREATE INDEX "SaleEvent_orderId_idx" ON "SaleEvent"("orderId");

-- CreateIndex
CREATE INDEX "SaleEvent_createdAt_idx" ON "SaleEvent"("createdAt");

-- CreateIndex
CREATE INDEX "Alert_status_severity_idx" ON "Alert"("status", "severity");

-- CreateIndex
CREATE INDEX "Alert_productId_idx" ON "Alert"("productId");

-- CreateIndex
CREATE INDEX "Alert_createdAt_idx" ON "Alert"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ShelfAlertConfig_shelfId_key" ON "ShelfAlertConfig"("shelfId");

-- CreateIndex
CREATE INDEX "WebhookLog_source_processed_idx" ON "WebhookLog"("source", "processed");

-- CreateIndex
CREATE INDEX "WebhookLog_createdAt_idx" ON "WebhookLog"("createdAt");

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_shelfId_fkey" FOREIGN KEY ("shelfId") REFERENCES "Shelf"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_shelfId_fkey" FOREIGN KEY ("shelfId") REFERENCES "Shelf"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleEvent" ADD CONSTRAINT "SaleEvent_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShelfAlertConfig" ADD CONSTRAINT "ShelfAlertConfig_shelfId_fkey" FOREIGN KEY ("shelfId") REFERENCES "Shelf"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Stock can never go negative, whatever the code path.
ALTER TABLE "Product" ADD CONSTRAINT "Product_stock_nonnegative" CHECK ("stock" >= 0);
