// src/types.ts

export interface VisualItemAnalysis {
    name: string;
    count: number;
    status: 'FULL' | 'LOW' | 'EMPTY' | 'MISPLACED';
    confidence: number;
}

export interface AIAnalysisResult {
    timestamp: Date;
    detectedItems: VisualItemAnalysis[];
    rawOutput?: string;
}

export interface StockUpdateResponse {
    message: string;
    currentStock: number;
    alertTriggered: boolean;
}

export interface NotificationPayload {
    alert: any;
    product: any;
    shelfLabel: string;
}

export interface WebhookEventData {
    event_type: 'order.completed' | 'order.cancelled' | 'order.refunded';
    data: {
        order_id: string;
        line_items: Array<{
            sku: string;
            quantity: number;
            price?: number;
        }>;
        timestamp?: string;
    };
    signature?: string;
}

export interface AlertStatistics {
    total: number;
    byType: Array<{ type: string; _count: number }>;
    bySeverity: Array<{ severity: string; _count: number }>;
    byStatus: Array<{ status: string; _count: number }>;
    period: string;
}

export interface AuditSummary {
    productId: string;
    sku: string;
    name: string;
    systemCount: number;
    visualCount: number;
    discrepancy: number;
    status: string;
    confidence: number;
}

export interface ShelfConfiguration {
    phantomStockThreshold: number;
    lowStockThreshold: number;
    checkIntervalMinutes: number;
    salesTriggerCount: number;
    enableSlack: boolean;
    enableSms: boolean;
    enableEmail: boolean;
}