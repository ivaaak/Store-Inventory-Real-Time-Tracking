// src/services/reconciliation.ts
// Pure decision logic for comparing the digital book against a visual count.
// Kept free of I/O so it can be unit tested directly.
import { AlertSeverity, AlertType } from '@prisma/client';

/** Defaults applied when a shelf has no ShelfAlertConfig row. */
export const DEFAULT_SHELF_CONFIG = {
  phantomStockThreshold: 5,
  lowStockThreshold: 3,
  checkIntervalMinutes: 30,
  salesTriggerCount: 10,
  enableSlack: true,
  enableSms: false,
  enableEmail: true,
} as const;

/** Below this confidence a visual count is treated as inconclusive. */
export const MIN_ACTIONABLE_CONFIDENCE = 0.6;

export interface AuditCounts {
  systemCount: number;
  visualCount: number;
  confidence: number;
}

export interface ReconciliationOutcome {
  type: AlertType;
  severity: AlertSeverity;
}

/**
 * Decide which alert (if any) an audit warrants.
 *
 * - PHANTOM_STOCK / CRITICAL: shelf looks empty while the book says we hold
 *   more than `phantomThreshold` units.
 * - DISCREPANCY / HIGH: counts differ by more than 3 with high confidence.
 * - DISCREPANCY / MEDIUM: any mismatch with reasonable confidence.
 *
 * Low-confidence readings never raise alerts; a failed or uncertain vision
 * call must not page staff about phantom stock.
 */
export function classifyAudit(
  { systemCount, visualCount, confidence }: AuditCounts,
  phantomThreshold: number = DEFAULT_SHELF_CONFIG.phantomStockThreshold
): ReconciliationOutcome | null {
  if (confidence < MIN_ACTIONABLE_CONFIDENCE) return null;

  const discrepancy = Math.abs(systemCount - visualCount);

  if (visualCount === 0 && systemCount > phantomThreshold) {
    return { type: AlertType.PHANTOM_STOCK, severity: AlertSeverity.CRITICAL };
  }
  if (discrepancy > 3 && confidence > 0.8) {
    return { type: AlertType.DISCREPANCY, severity: AlertSeverity.HIGH };
  }
  if (discrepancy >= 1 && confidence > 0.7) {
    return { type: AlertType.DISCREPANCY, severity: AlertSeverity.MEDIUM };
  }
  return null;
}

/** Severity for a low-stock alert after a sale. */
export function lowStockSeverity(stock: number): AlertSeverity {
  return stock === 0 ? AlertSeverity.CRITICAL : AlertSeverity.HIGH;
}
