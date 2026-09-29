// Shapes returned by the backend API (see docs/API_DOCUMENTATION.md).

export type AlertSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
export type AlertStatus = 'OPEN' | 'ACKNOWLEDGED' | 'IN_PROGRESS' | 'RESOLVED' | 'DISMISSED';
export type AlertType = 'PHANTOM_STOCK' | 'LOW_STOCK' | 'OVERSTOCKED' | 'MISPLACED' | 'CAMERA_FAILURE' | 'DISCREPANCY';
export type StockStatus = 'OUT' | 'LOW' | 'OK' | 'OVER';

export const SEVERITIES: AlertSeverity[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
export const ACTIVE_STATUSES: AlertStatus[] = ['OPEN', 'ACKNOWLEDGED', 'IN_PROGRESS'];

export interface Pagination {
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export interface Alert {
  id: string;
  productId: string;
  shelfLabel: string;
  type: AlertType;
  severity: AlertSeverity;
  message: string;
  status: AlertStatus;
  acknowledgedAt: string | null;
  acknowledgedBy: string | null;
  resolvedAt: string | null;
  resolvedBy: string | null;
  resolution: string | null;
  notificationsSent: string[];
  createdAt: string;
  updatedAt: string;
  product?: { sku: string; name: string; stock: number; minThreshold: number };
}

export interface Product {
  id: string;
  sku: string;
  name: string;
  stock: number;
  minThreshold: number;
  maxCapacity: number;
  price: string; // Prisma Decimal serialises as a string
  category: string | null;
  imageUrl: string | null;
  shelfId: string | null;
  shelf: { label: string; zone: string | null } | null;
  status: StockStatus;
  lastAudit: { createdAt: string; visualCount: number; confidence: number; discrepancy: number } | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProductMetrics {
  totalSales: number;
  averageDailySales: number;
  stockouts: number;
  daysOfCover: number | null;
  turnoverRate: number;
}

export interface ShelfConfig {
  phantomStockThreshold: number;
  lowStockThreshold: number;
  checkIntervalMinutes: number;
  salesTriggerCount: number;
  enableSlack: boolean;
  enableSms: boolean;
  enableEmail: boolean;
}

export interface Shelf {
  id: string;
  label: string;
  zone: string | null;
  cameraUrl: string | null;
  lastScanned: string | null;
  posX: number | null;
  posY: number | null;
  products: Array<Pick<Product, 'id' | 'sku' | 'name' | 'stock' | 'minThreshold' | 'maxCapacity'>>;
  alertConfig: ShelfConfig | null;
  openAlerts: number;
  worstSeverity: AlertSeverity | null;
  auditDue: boolean;
}

export interface AuditLog {
  id: string;
  productId: string;
  shelfId: string;
  systemCount: number;
  visualCount: number;
  discrepancy: number;
  confidence: number;
  status: 'PENDING' | 'COMPLETED' | 'FAILED' | 'REVIEWING';
  imageUrl: string | null;
  rawAiOutput: string | null;
  alertTriggered: boolean;
  alertType: AlertType | null;
  createdAt: string;
  product: { sku: string; name: string };
  shelf?: { label: string; zone: string | null };
}

export interface AuditResult {
  message: string;
  shelfLabel: string;
  timestamp: string;
  imageUrl: string;
  provider: 'openai' | 'mock';
  summary: Array<{
    auditLogId: string;
    sku: string;
    name: string;
    systemCount: number;
    visualCount: number;
    discrepancy: number;
    status: string;
    confidence: number;
    alertType: AlertType | null;
  }>;
  metadata: { totalProducts: number; productsDetected: number; averageConfidence: number; alertsRaised: number };
}

export interface DashboardOverview {
  inventory: {
    totalProducts: number;
    totalStock: number;
    inStockProducts: number;
    lowStockProducts: number;
    outOfStockProducts: number;
    overstockedProducts: number;
    stockValue: number;
  };
  shelves: { total: number; needingAudit: number };
  alerts: { open: number; critical: number; phantomStockIncidents: number };
  audits: { recent: number; today: number; averageConfidence: number | null };
  sales: { totalQuantity: number; period: string };
}

export interface AlertTrendDay {
  date: string;
  total: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
}

export interface StockMovement {
  topSellingProducts: Array<{ sku: string; name: string; category: string | null; totalSold: number; transactionCount: number }>;
  salesByCategory: Array<{ category: string; quantity: number }>;
}

export interface FloorPlanWall {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface FloorPlanPoint {
  id: string;
  type: 'camera' | 'entrance' | 'checkout';
  label: string;
  x: number;
  y: number;
  cameraUrl?: string;
}

export interface FloorPlan {
  walls: FloorPlanWall[];
  points: FloorPlanPoint[];
  updatedAt: string | null;
}

export type LiveEventType =
  | 'stock.changed'
  | 'alert.created'
  | 'alert.updated'
  | 'audit.completed'
  | 'shelf.changed'
  | 'floorplan.changed';

export interface LiveEvent {
  type: LiveEventType;
  at: string;
  [key: string]: unknown;
}
