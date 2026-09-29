// src/services/alertService.ts
import { Alert, AlertStatus, AlertSeverity, AlertType } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { publish } from '../lib/events';
import { logger } from '../utils/logger';
import { AppError } from '../middleware/errorHandler';
import { NotificationService } from './notificationService';
import { CreateAlertInput } from '../validation/schemas';

const ACTIVE_STATUSES: AlertStatus[] = [AlertStatus.OPEN, AlertStatus.ACKNOWLEDGED, AlertStatus.IN_PROGRESS];
const SEVERITY_ORDER: AlertSeverity[] = [AlertSeverity.CRITICAL, AlertSeverity.HIGH, AlertSeverity.MEDIUM, AlertSeverity.LOW];

export class AlertService {
  /**
   * Create a new alert and trigger notifications.
   * There is at most one active alert per product and type: a repeat is
   * folded into the existing alert, escalating its severity if the new
   * condition is worse (e.g. LOW_STOCK HIGH -> CRITICAL at zero stock).
   */
  static async createAlert(input: CreateAlertInput): Promise<Alert> {
    const existingAlert = await prisma.alert.findFirst({
      where: {
        productId: input.productId,
        type: input.type,
        status: { in: ACTIVE_STATUSES },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (existingAlert) {
      if (SEVERITY_ORDER.indexOf(input.severity) < SEVERITY_ORDER.indexOf(existingAlert.severity)) {
        const escalated = await prisma.alert.update({
          where: { id: existingAlert.id },
          data: { severity: input.severity, message: input.message, status: AlertStatus.OPEN },
        });
        logger.info('Alert escalated', { alertId: escalated.id, severity: escalated.severity });
        publish({ type: 'alert.updated', alertId: escalated.id, status: escalated.status });
        AlertService.sendNotifications(escalated).catch((err) => {
          logger.error('Failed to send notifications', { alertId: escalated.id, error: err?.message });
        });
        return escalated;
      }
      logger.info('Duplicate alert suppressed', { alertId: existingAlert.id, type: input.type });
      return existingAlert;
    }

    const alert = await prisma.alert.create({
      data: {
        productId: input.productId,
        shelfLabel: input.shelfLabel,
        type: input.type,
        severity: input.severity,
        message: input.message,
        status: AlertStatus.OPEN,
        notificationsSent: [],
      },
    });

    logger.info('Alert created', { alertId: alert.id, type: alert.type, severity: alert.severity });
    publish({
      type: 'alert.created',
      alertId: alert.id,
      severity: alert.severity,
      alertType: alert.type,
      shelfLabel: alert.shelfLabel,
    });

    // Fire-and-forget: notification latency must not block the request.
    AlertService.sendNotifications(alert).catch((err) => {
      logger.error('Failed to send notifications', { alertId: alert.id, error: err?.message });
    });

    return alert;
  }

  /**
   * Send notifications for an alert
   */
  private static async sendNotifications(alert: Alert): Promise<void> {
    const product = await prisma.product.findUnique({
      where: { id: alert.productId },
      include: { shelf: { include: { alertConfig: true } } },
    });

    if (!product) return;

    const config = product.shelf?.alertConfig;
    const payload = { alert, product, shelfLabel: alert.shelfLabel };

    const channels: Array<[string, boolean, () => Promise<boolean>]> = [
      ['slack', config?.enableSlack !== false, () => NotificationService.sendSlackAlert(payload)],
      // SMS only for critical alerts
      [
        'sms',
        !!config?.enableSms && alert.severity === AlertSeverity.CRITICAL,
        () => NotificationService.sendSmsAlert(payload),
      ],
      ['email', config?.enableEmail !== false, () => NotificationService.sendEmailAlert(payload)],
    ];

    const sentChannels: string[] = [];
    for (const [name, enabled, send] of channels) {
      if (!enabled) continue;
      try {
        if (await send()) sentChannels.push(name);
      } catch (err: any) {
        logger.error(`${name} notification failed`, { alertId: alert.id, error: err?.message });
      }
    }

    if (sentChannels.length > 0) {
      await prisma.alert.update({
        where: { id: alert.id },
        data: { notificationsSent: sentChannels },
      });
    }

    logger.info('Notifications dispatched', { alertId: alert.id, channels: sentChannels });
  }

  /**
   * Get all active alerts
   */
  static async getOpenAlerts(severity?: AlertSeverity): Promise<Alert[]> {
    return prisma.alert.findMany({
      where: {
        status: { in: ACTIVE_STATUSES },
        ...(severity && { severity }),
      },
      orderBy: [{ severity: 'asc' }, { createdAt: 'desc' }],
    });
  }

  /**
   * Acknowledge an alert
   */
  static async acknowledgeAlert(alertId: string, acknowledgedBy: string): Promise<Alert> {
    const alert = await prisma.alert.findUnique({ where: { id: alertId } });
    if (!alert) throw new AppError(404, 'Alert not found');
    if (alert.status !== AlertStatus.OPEN) {
      throw new AppError(409, `Alert is already ${alert.status.toLowerCase()}`);
    }

    const updated = await prisma.alert.update({
      where: { id: alertId },
      data: {
        status: AlertStatus.ACKNOWLEDGED,
        acknowledgedAt: new Date(),
        acknowledgedBy,
      },
    });

    publish({ type: 'alert.updated', alertId, status: updated.status });
    return updated;
  }

  /**
   * Resolve (or dismiss) an alert
   */
  static async resolveAlert(
    alertId: string,
    resolvedBy: string,
    resolution: string,
    dismiss = false
  ): Promise<Alert> {
    const alert = await prisma.alert.findUnique({ where: { id: alertId } });
    if (!alert) throw new AppError(404, 'Alert not found');
    if (!ACTIVE_STATUSES.includes(alert.status)) {
      throw new AppError(409, `Alert is already ${alert.status.toLowerCase()}`);
    }

    const updated = await prisma.alert.update({
      where: { id: alertId },
      data: {
        status: dismiss ? AlertStatus.DISMISSED : AlertStatus.RESOLVED,
        resolvedAt: new Date(),
        resolvedBy,
        resolution,
      },
    });

    publish({ type: 'alert.updated', alertId, status: updated.status });
    return updated;
  }

  /**
   * Close active alerts of a given type for a product, e.g. LOW_STOCK once
   * the shelf has been restocked.
   */
  static async autoResolve(productId: string, type: AlertType, resolution: string): Promise<number> {
    const active = await prisma.alert.findMany({
      where: { productId, type, status: { in: ACTIVE_STATUSES } },
      select: { id: true },
    });
    if (active.length === 0) return 0;

    await prisma.alert.updateMany({
      where: { id: { in: active.map((a) => a.id) } },
      data: {
        status: AlertStatus.RESOLVED,
        resolvedAt: new Date(),
        resolvedBy: 'system',
        resolution,
      },
    });

    for (const { id } of active) {
      publish({ type: 'alert.updated', alertId: id, status: AlertStatus.RESOLVED });
    }
    logger.info('Alerts auto-resolved', { productId, type, count: active.length });
    return active.length;
  }

  /**
   * Get alert statistics
   */
  static async getAlertStats(days: number = 7) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const where = { createdAt: { gte: since } };

    const [total, byType, bySeverity, byStatus] = await Promise.all([
      prisma.alert.count({ where }),
      prisma.alert.groupBy({ by: ['type'], where, _count: true }),
      prisma.alert.groupBy({ by: ['severity'], where, _count: true }),
      prisma.alert.groupBy({ by: ['status'], where, _count: true }),
    ]);

    return {
      total,
      byType,
      bySeverity,
      byStatus,
      period: `Last ${days} days`,
    };
  }
}
