// src/services/alertService.ts
import { PrismaClient, Alert, AlertStatus, AlertType, AlertSeverity } from '@prisma/client';
import { logger } from '../utils/logger';
import { NotificationService } from './notificationService';
import { CreateAlertInput } from '../validation/schemas';

const prisma = new PrismaClient();

export class AlertService {
  /**
   * Create a new alert and trigger notifications
   */
  static async createAlert(input: CreateAlertInput): Promise<Alert> {
    logger.info('Creating alert', input);

    // Check for duplicate alerts in the last hour
    const existingAlert = await prisma.alert.findFirst({
      where: {
        productId: input.productId,
        type: input.type,
        status: { in: [AlertStatus.OPEN, AlertStatus.ACKNOWLEDGED] },
        createdAt: {
          gte: new Date(Date.now() - 60 * 60 * 1000) // Last hour
        }
      }
    });

    if (existingAlert) {
      logger.info('Duplicate alert suppressed', { alertId: existingAlert.id });
      return existingAlert;
    }

    // Create the alert
    const alert = await prisma.alert.create({
      data: {
        productId: input.productId,
        shelfLabel: input.shelfLabel,
        type: input.type,
        severity: input.severity,
        message: input.message,
        status: AlertStatus.OPEN,
        notificationsSent: [],
      }
    });

    // Trigger notifications asynchronously
    this.sendNotifications(alert).catch(err => {
      logger.error('Failed to send notifications', { alertId: alert.id, error: err });
    });

    return alert;
  }

  /**
   * Send notifications for an alert
   */
  private static async sendNotifications(alert: Alert): Promise<void> {
    const sentChannels: string[] = [];

    try {
      // Get product details for richer notifications
      const product = await prisma.product.findUnique({
        where: { id: alert.productId },
        include: { shelf: { include: { alertConfig: true } } }
      });

      if (!product) return;

      const config = product.shelf?.alertConfig;
      const notificationPayload = {
        alert,
        product,
        shelfLabel: alert.shelfLabel
      };

      // Slack notification
      if (config?.enableSlack !== false) {
        try {
          await NotificationService.sendSlackAlert(notificationPayload);
          sentChannels.push('slack');
        } catch (err) {
          logger.error('Slack notification failed', { error: err });
        }
      }

      // SMS notification (for critical alerts only)
      if (config?.enableSms && alert.severity === AlertSeverity.CRITICAL) {
        try {
          await NotificationService.sendSmsAlert(notificationPayload);
          sentChannels.push('sms');
        } catch (err) {
          logger.error('SMS notification failed', { error: err });
        }
      }

      // Email notification
      if (config?.enableEmail !== false) {
        try {
          await NotificationService.sendEmailAlert(notificationPayload);
          sentChannels.push('email');
        } catch (err) {
          logger.error('Email notification failed', { error: err });
        }
      }

      // Update alert with notification status
      await prisma.alert.update({
        where: { id: alert.id },
        data: { notificationsSent: sentChannels }
      });

      logger.info('Notifications sent', { alertId: alert.id, channels: sentChannels });
    } catch (error) {
      logger.error('Error sending notifications', { alertId: alert.id, error });
    }
  }

  /**
   * Get all open alerts
   */
  static async getOpenAlerts(severity?: AlertSeverity): Promise<Alert[]> {
    return prisma.alert.findMany({
      where: {
        status: { in: [AlertStatus.OPEN, AlertStatus.ACKNOWLEDGED] },
        ...(severity && { severity })
      },
      orderBy: [
        { severity: 'asc' }, // CRITICAL first
        { createdAt: 'desc' }
      ]
    });
  }

  /**
   * Acknowledge an alert
   */
  static async acknowledgeAlert(alertId: string, acknowledgedBy: string): Promise<Alert> {
    logger.info('Acknowledging alert', { alertId, acknowledgedBy });

    return prisma.alert.update({
      where: { id: alertId },
      data: {
        status: AlertStatus.ACKNOWLEDGED,
        updatedAt: new Date()
      }
    });
  }

  /**
   * Resolve an alert
   */
  static async resolveAlert(
    alertId: string, 
    resolvedBy: string, 
    resolution: string
  ): Promise<Alert> {
    logger.info('Resolving alert', { alertId, resolvedBy });

    return prisma.alert.update({
      where: { id: alertId },
      data: {
        status: AlertStatus.RESOLVED,
        resolvedAt: new Date(),
        resolvedBy,
        resolution
      }
    });
  }

  /**
   * Get alert statistics
   */
  static async getAlertStats(days: number = 7) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const [total, byType, bySeverity, byStatus] = await Promise.all([
      prisma.alert.count({ where: { createdAt: { gte: since } } }),
      
      prisma.alert.groupBy({
        by: ['type'],
        where: { createdAt: { gte: since } },
        _count: true
      }),
      
      prisma.alert.groupBy({
        by: ['severity'],
        where: { createdAt: { gte: since } },
        _count: true
      }),
      
      prisma.alert.groupBy({
        by: ['status'],
        where: { createdAt: { gte: since } },
        _count: true
      })
    ]);

    return {
      total,
      byType,
      bySeverity,
      byStatus,
      period: `Last ${days} days`
    };
  }
}
