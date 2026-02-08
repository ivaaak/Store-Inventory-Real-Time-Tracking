# API Documentation - Shelf Monitoring System v2.0

## Base URL
```
http://localhost:3000/api
```

---

## Authentication
Currently, the API does not require authentication. For production deployment, implement JWT or API key authentication.

---

## Table of Contents
1. [Inventory Management](#inventory-management)
2. [Product Management](#product-management)
3. [Shelf Management](#shelf-management)
4. [Vision & Auditing](#vision--auditing)
5. [Alert Management](#alert-management)
6. [Analytics & Reporting](#analytics--reporting)
7. [Webhooks](#webhooks)
8. [Configuration](#configuration)

---

## Inventory Management

### Add Stock
**POST** `/api/stock/add`

Add inventory to a shelf.

**Request Body:**
```json
{
  "sku": "MILK-001",
  "quantity": 12,
  "shelfLabel": "DAIRY-A1"
}
```

**Response:** `200 OK`
```json
{
  "message": "Stock successfully added",
  "data": {
    "sku": "MILK-001",
    "name": "Whole Milk 1L",
    "currentStock": 36,
    "shelfLabel": "DAIRY-A1"
  }
}
```

---

### Record Sale
**POST** `/api/stock/sale`

Record a sale (usually triggered by POS webhook).

**Request Body:**
```json
{
  "sku": "MILK-001",
  "quantity": 2,
  "orderId": "ORDER-123"
}
```

**Response:** `200 OK`
```json
{
  "message": "Sale recorded successfully",
  "data": {
    "sku": "MILK-001",
    "name": "Whole Milk 1L",
    "remainingStock": 34,
    "needsRestock": false,
    "belowThreshold": false
  }
}
```

---

### Get Stock Level
**GET** `/api/stock/:sku`

Get current stock information for a product.

**Response:** `200 OK`
```json
{
  "data": {
    "sku": "MILK-001",
    "name": "Whole Milk 1L",
    "currentStock": 34,
    "minThreshold": 5,
    "maxCapacity": 50,
    "shelf": {
      "label": "DAIRY-A1",
      "zone": "Dairy Section"
    },
    "lastAudit": {
      "systemCount": 34,
      "visualCount": 33,
      "discrepancy": 1,
      "confidence": 0.92,
      "timestamp": "2024-01-15T10:30:00Z"
    },
    "needsRestock": false
  }
}
```

---

### Get Sales Velocity
**GET** `/api/stock/:sku/velocity?hours=24`

Get sales velocity for demand forecasting.

**Query Parameters:**
- `hours` (optional): Time period in hours (default: 24)

**Response:** `200 OK`
```json
{
  "data": {
    "sku": "MILK-001",
    "hoursAnalyzed": 24,
    "totalSold": 18,
    "averagePerHour": "0.75"
  }
}
```

---

## Product Management

### Create Product
**POST** `/api/products`

Create a new product in the system.

**Request Body:**
```json
{
  "sku": "CHEESE-004",
  "name": "Swiss Cheese 200g",
  "minThreshold": 3,
  "maxCapacity": 30,
  "price": 5.99,
  "category": "Dairy",
  "imageUrl": "https://example.com/cheese.jpg"
}
```

**Response:** `201 Created`

---

### List Products
**GET** `/api/products?category=Dairy&lowStock=true&limit=50&offset=0`

List products with optional filtering.

**Query Parameters:**
- `category` (optional): Filter by category
- `shelfLabel` (optional): Filter by shelf
- `lowStock` (optional): Show only low stock items (true/false)
- `limit` (optional): Results per page (default: 50)
- `offset` (optional): Pagination offset (default: 0)

**Response:** `200 OK`
```json
{
  "data": [
    {
      "sku": "MILK-001",
      "name": "Whole Milk 1L",
      "stock": 34,
      "minThreshold": 5,
      "category": "Dairy",
      "shelf": {
        "label": "DAIRY-A1",
        "zone": "Dairy Section"
      }
    }
  ],
  "pagination": {
    "total": 125,
    "limit": 50,
    "offset": 0,
    "hasMore": true
  }
}
```

---

### Get Products Needing Attention
**GET** `/api/products/attention`

Get products with low stock or recent discrepancies.

**Response:** `200 OK`
```json
{
  "data": [...],
  "count": 8
}
```

---

### Get Inventory Summary
**GET** `/api/products/summary`

Get high-level inventory statistics.

**Response:** `200 OK`
```json
{
  "data": {
    "totalProducts": 125,
    "totalStock": 3456,
    "lowStockItems": 8,
    "outOfStockItems": 2,
    "overstockedItems": 1,
    "categories": [
      { "category": "Dairy", "count": 45 },
      { "category": "Beverages", "count": 80 }
    ]
  }
}
```

---

### Assign Product to Shelf
**POST** `/api/products/:sku/assign-shelf`

Assign or reassign a product to a specific shelf.

**Request Body:**
```json
{
  "shelfLabel": "DAIRY-A1"
}
```

---

### Get Product Metrics
**GET** `/api/products/:sku/metrics?days=30`

Get performance metrics for a product.

**Response:** `200 OK`
```json
{
  "data": {
    "totalSales": 180,
    "averageDailySales": "6.00",
    "stockouts": 2,
    "lastRestockDate": null,
    "turnoverRate": "5.29"
  },
  "period": "Last 30 days"
}
```

---

## Shelf Management

### Create Shelf
**POST** `/api/shelves`

Create a new shelf in the system.

**Request Body:**
```json
{
  "label": "DAIRY-A1",
  "zone": "Dairy Section",
  "cameraUrl": "http://192.168.1.100/camera"
}
```

---

### List Shelves
**GET** `/api/shelves?zone=Dairy&limit=50&offset=0`

List all shelves with optional filtering.

**Response:** `200 OK`
```json
{
  "data": [
    {
      "label": "DAIRY-A1",
      "zone": "Dairy Section",
      "lastScanned": "2024-01-15T09:30:00Z",
      "products": [
        { "sku": "MILK-001", "name": "Whole Milk 1L", "stock": 34 }
      ],
      "alertConfig": {
        "phantomStockThreshold": 5,
        "checkIntervalMinutes": 30
      }
    }
  ],
  "pagination": {...}
}
```

---

### Get Shelves Due for Audit
**GET** `/api/shelves/audit/due`

Get shelves that need to be audited based on time or sales triggers.

---

### Get Shelf Metrics
**GET** `/api/shelves/:label/metrics?days=7`

Get performance metrics for a shelf.

**Response:** `200 OK`
```json
{
  "data": {
    "totalProducts": 12,
    "totalStock": 234,
    "lowStockProducts": 2,
    "auditCount": 14,
    "averageDiscrepancy": "1.23",
    "lastAuditDate": "2024-01-15T09:30:00Z"
  },
  "period": "Last 7 days"
}
```

---

### Get Capacity Utilization
**GET** `/api/shelves/:label/capacity`

Check how full a shelf is compared to its capacity.

**Response:** `200 OK`
```json
{
  "data": {
    "currentCapacity": 234,
    "maxCapacity": 400,
    "utilizationPercent": "58.50",
    "status": "OPTIMAL"
  }
}
```

---

## Vision & Auditing

### Perform Vision Audit
**POST** `/api/vision/audit`

Upload an image and perform AI-powered shelf audit.

**Content-Type:** `multipart/form-data`

**Form Data:**
- `image`: Image file (JPG, PNG, max 10MB)
- `shelfLabel`: Shelf identifier
- `force`: Force audit even if recently scanned (optional, default: false)

**Response:** `200 OK`
```json
{
  "message": "Audit completed successfully",
  "shelfLabel": "DAIRY-A1",
  "timestamp": "2024-01-15T10:35:00Z",
  "summary": [
    {
      "productId": "prod_123",
      "sku": "MILK-001",
      "name": "Whole Milk 1L",
      "systemCount": 34,
      "visualCount": 33,
      "discrepancy": 1,
      "status": "FULL",
      "confidence": 0.92
    }
  ],
  "metadata": {
    "totalProducts": 12,
    "productsDetected": 12,
    "averageConfidence": "0.89"
  }
}
```

**Error Response:** `429 Too Many Requests`
```json
{
  "error": "Audit performed too recently",
  "message": "Please wait 15 more minutes",
  "nextAuditAt": "2024-01-15T11:00:00Z"
}
```

---

### Get Audit History
**GET** `/api/vision/history/:shelfLabel?limit=20&offset=0`

Get historical audit logs for a shelf.

**Response:** `200 OK`
```json
{
  "data": [
    {
      "id": "audit_123",
      "createdAt": "2024-01-15T10:35:00Z",
      "product": {
        "sku": "MILK-001",
        "name": "Whole Milk 1L"
      },
      "systemCount": 34,
      "visualCount": 33,
      "discrepancy": 1,
      "confidence": 0.92,
      "status": "COMPLETED",
      "alertTriggered": false
    }
  ],
  "pagination": {...}
}
```

---

## Alert Management

### Get Alerts
**GET** `/api/alerts?severity=CRITICAL&status=OPEN&limit=50&offset=0`

List alerts with optional filtering.

**Query Parameters:**
- `severity`: CRITICAL, HIGH, MEDIUM, LOW
- `status`: OPEN, ACKNOWLEDGED, IN_PROGRESS, RESOLVED, DISMISSED
- `limit`: Results per page (default: 50)
- `offset`: Pagination offset (default: 0)

**Response:** `200 OK`
```json
{
  "data": [
    {
      "id": "alert_123",
      "productId": "prod_123",
      "product": {
        "sku": "MILK-001",
        "name": "Whole Milk 1L",
        "stock": 0
      },
      "shelfLabel": "DAIRY-A1",
      "type": "PHANTOM_STOCK",
      "severity": "CRITICAL",
      "status": "OPEN",
      "message": "Database shows 15 units, but shelf is EMPTY!",
      "notificationsSent": ["slack", "email"],
      "createdAt": "2024-01-15T08:45:00Z"
    }
  ],
  "pagination": {...}
}
```

---

### Get Alert Statistics
**GET** `/api/alerts/stats?days=7`

Get alert statistics and trends.

**Response:** `200 OK`
```json
{
  "data": {
    "total": 45,
    "byType": [
      { "type": "PHANTOM_STOCK", "_count": 8 },
      { "type": "LOW_STOCK", "_count": 32 }
    ],
    "bySeverity": [
      { "severity": "CRITICAL", "_count": 12 },
      { "severity": "HIGH", "_count": 20 }
    ],
    "byStatus": [
      { "status": "OPEN", "_count": 15 },
      { "status": "RESOLVED", "_count": 30 }
    ],
    "period": "Last 7 days"
  }
}
```

---

### Acknowledge Alert
**POST** `/api/alerts/:alertId/acknowledge`

Mark an alert as acknowledged.

**Request Body:**
```json
{
  "acknowledgedBy": "staff-001"
}
```

---

### Resolve Alert
**POST** `/api/alerts/:alertId/resolve`

Resolve an alert with notes.

**Request Body:**
```json
{
  "resolvedBy": "manager-001",
  "resolution": "Stock replenished. Verified 25 units on shelf."
}
```

---

## Analytics & Reporting

### Get Dashboard Overview
**GET** `/api/analytics/dashboard?days=7`

Get high-level dashboard statistics.

**Response:** `200 OK`
```json
{
  "data": {
    "inventory": {
      "totalProducts": 125,
      "lowStockProducts": 8,
      "stockValue": 0
    },
    "shelves": {
      "total": 15,
      "needingAudit": 3
    },
    "alerts": {
      "open": 12,
      "phantomStockIncidents": 3
    },
    "audits": {
      "recent": 45,
      "averageAccuracy": 0.91
    },
    "sales": {
      "totalQuantity": 1234,
      "period": "Last 7 days"
    }
  }
}
```

---

### Get Alert Trends
**GET** `/api/analytics/alert-trends?days=30`

Get daily alert trends over time.

**Response:** `200 OK`
```json
{
  "data": [
    {
      "date": "2024-01-01",
      "total": 12,
      "critical": 3,
      "high": 5,
      "medium": 3,
      "low": 1,
      "phantomStock": 2,
      "lowStock": 8
    }
  ],
  "period": "Last 30 days"
}
```

---

### Get Stock Movement Analysis
**GET** `/api/analytics/stock-movement?days=30`

Analyze product sales and movement patterns.

**Response:** `200 OK`
```json
{
  "data": {
    "topSellingProducts": [
      {
        "sku": "MILK-001",
        "name": "Whole Milk 1L",
        "totalSold": 450,
        "transactionCount": 180
      }
    ],
    "salesByCategory": [
      { "category": "Dairy", "quantity": 1234 },
      { "category": "Beverages", "quantity": 2345 }
    ]
  },
  "period": "Last 30 days"
}
```

---

### Get Phantom Stock Hotspots
**GET** `/api/analytics/phantom-hotspots?days=30`

Identify products and shelves with recurring phantom stock issues.

**Response:** `200 OK`
```json
{
  "data": {
    "byProduct": [
      {
        "sku": "MILK-001",
        "name": "Whole Milk 1L",
        "shelfLabel": "DAIRY-A1",
        "incidents": 8
      }
    ],
    "byShelf": [
      {
        "shelfLabel": "DAIRY-A1",
        "incidents": 15
      }
    ]
  },
  "period": "Last 30 days"
}
```

---

### Get System Health
**GET** `/api/analytics/system-health`

Monitor system health and performance.

**Response:** `200 OK`
```json
{
  "data": {
    "webhooks": {
      "processedLastHour": 145,
      "status": "healthy"
    },
    "audits": {
      "completedLastHour": 12,
      "status": "active"
    },
    "alerts": {
      "criticalOpen": 3,
      "status": "normal"
    },
    "errors": {
      "lastHour": 0,
      "status": "healthy"
    },
    "overall": "healthy"
  }
}
```

---

### Generate Comprehensive Report
**GET** `/api/analytics/report?days=30`

Generate a complete analytics report.

---

## Webhooks

### POS Sale Webhook
**POST** `/api/webhooks/pos-sale`

Receive POS sale events.

**Headers:**
- `X-POS-Signature`: HMAC-SHA256 signature of the payload

**Request Body:**
```json
{
  "event_type": "order.completed",
  "data": {
    "order_id": "ORDER-123",
    "line_items": [
      {
        "sku": "MILK-001",
        "quantity": 2,
        "price": 3.99
      }
    ],
    "timestamp": "2024-01-15T10:30:00Z"
  }
}
```

**Response:** `200 OK`
```json
{
  "status": "ACK",
  "correlationId": "abc-123-xyz"
}
```

---

### Webhook Health Check
**GET** `/api/webhooks/health`

Check webhook handler status.

---

## Configuration

### Get Shelf Configuration
**GET** `/api/config/shelf/:shelfLabel`

Get alert and audit configuration for a shelf.

---

### Update Shelf Configuration
**POST** `/api/config/shelf/:shelfLabel`

Update shelf configuration.

**Request Body:**
```json
{
  "phantomStockThreshold": 5,
  "lowStockThreshold": 3,
  "checkIntervalMinutes": 30,
  "salesTriggerCount": 10,
  "enableSlack": true,
  "enableSms": false,
  "enableEmail": true
}
```

---

## Error Responses

### 400 Bad Request
```json
{
  "error": "Validation failed",
  "details": [
    {
      "path": "sku",
      "message": "SKU is required"
    }
  ]
}
```

### 404 Not Found
```json
{
  "error": "Product not found",
  "sku": "MILK-999"
}
```

### 429 Too Many Requests
```json
{
  "error": "Too many requests from this IP, please try again later."
}
```

### 500 Internal Server Error
```json
{
  "error": "Internal server error"
}
```

---

## Rate Limits

- **Standard API**: 100 requests per 15 minutes per IP
- **Webhooks**: 60 requests per minute per IP

---

## Postman Collection

Import the provided Postman collection for easy testing:
[Download Postman Collection](./postman_collection.json)

---

**Last Updated:** 2024
**API Version:** 2.0
