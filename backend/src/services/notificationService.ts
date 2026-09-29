// src/services/notificationService.ts
import axios from 'axios';
import { logger } from '../utils/logger';
import { Alert, Product, AlertSeverity } from '@prisma/client';

const escapeHtml = (value: unknown): string =>
  String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

interface NotificationPayload {
  alert: Alert;
  product: Product;
  shelfLabel: string;
}

export class NotificationService {
  /**
   * Send Slack notification
   */
  static async sendSlackAlert(payload: NotificationPayload): Promise<boolean> {
    const webhookUrl = process.env.SLACK_WEBHOOK_URL;
    
    if (!webhookUrl) {
      logger.debug('Slack webhook URL not configured, skipping');
      return false;
    }

    const { alert, product, shelfLabel } = payload;
    
    const color = this.getSeverityColor(alert.severity);
    const emoji = this.getSeverityEmoji(alert.severity);

    const slackMessage = {
      text: `${emoji} *${alert.severity}* Alert: ${alert.type}`,
      attachments: [
        {
          color,
          fields: [
            {
              title: 'Product',
              value: `${product.name} (SKU: ${product.sku})`,
              short: true
            },
            {
              title: 'Shelf',
              value: shelfLabel,
              short: true
            },
            {
              title: 'Current Stock',
              value: product.stock.toString(),
              short: true
            },
            {
              title: 'Severity',
              value: alert.severity,
              short: true
            },
            {
              title: 'Message',
              value: alert.message,
              short: false
            }
          ],
          footer: 'Shelf Monitoring System',
          ts: Math.floor(alert.createdAt.getTime() / 1000)
        }
      ]
    };

    try {
      await axios.post(webhookUrl, slackMessage, { timeout: 10_000 });
      logger.info('Slack notification sent', { alertId: alert.id });
      return true;
    } catch (error) {
      logger.error('Failed to send Slack notification', { error });
      throw error;
    }
  }

  /**
   * Send SMS alert via Twilio
   */
  static async sendSmsAlert(payload: NotificationPayload): Promise<boolean> {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const fromNumber = process.env.TWILIO_FROM_NUMBER;
    const toNumber = process.env.ALERT_SMS_NUMBER;

    if (!accountSid || !authToken || !fromNumber || !toNumber) {
      logger.debug('Twilio not configured, skipping SMS');
      return false;
    }

    const { alert, product, shelfLabel } = payload;

    const message = `🚨 ${alert.severity} ALERT
Product: ${product.name}
Shelf: ${shelfLabel}
Issue: ${alert.type}
Stock: ${product.stock}
${alert.message}`;

    try {
      // Using Twilio REST API
      const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
      const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');

      await axios.post(
        url,
        new URLSearchParams({
          To: toNumber,
          From: fromNumber,
          Body: message
        }),
        {
          headers: {
            'Authorization': `Basic ${auth}`,
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );

      logger.info('SMS notification sent', { alertId: alert.id });
      return true;
    } catch (error) {
      logger.error('Failed to send SMS notification', { error });
      throw error;
    }
  }

  /**
   * Send Email alert
   */
  static async sendEmailAlert(payload: NotificationPayload): Promise<boolean> {
    const apiKey = process.env.SENDGRID_API_KEY;
    const fromEmail = process.env.EMAIL_FROM;
    const toEmail = process.env.ALERT_EMAIL_TO;

    if (!apiKey || !fromEmail || !toEmail) {
      logger.debug('Email not configured, skipping email notification');
      return false;
    }

    const { alert, product } = payload;

    const emailData = {
      personalizations: [
        {
          to: [{ email: toEmail }],
          subject: `${alert.severity} Alert: ${alert.type} - ${product.name}`
        }
      ],
      from: { email: fromEmail, name: 'Shelf Monitoring System' },
      content: [
        {
          type: 'text/html',
          value: this.generateEmailHtml(payload)
        }
      ]
    };

    try {
      await axios.post(
        'https://api.sendgrid.com/v3/mail/send',
        emailData,
        {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      logger.info('Email notification sent', { alertId: alert.id });
      return true;
    } catch (error) {
      logger.error('Failed to send email notification', { error });
      throw error;
    }
  }

  /**
   * Generate HTML email template
   */
  private static generateEmailHtml(payload: NotificationPayload): string {
    const { alert, product } = payload;
    const shelfLabel = escapeHtml(payload.shelfLabel);
    const color = this.getSeverityColor(alert.severity);

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: ${color}; color: white; padding: 20px; border-radius: 5px 5px 0 0; }
          .content { background: #f4f4f4; padding: 20px; border-radius: 0 0 5px 5px; }
          .field { margin: 10px 0; }
          .label { font-weight: bold; }
          .footer { text-align: center; margin-top: 20px; color: #777; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h2>🚨 ${alert.severity} Alert</h2>
            <p>${alert.type}</p>
          </div>
          <div class="content">
            <div class="field">
              <span class="label">Product:</span> ${escapeHtml(product.name)} (SKU: ${escapeHtml(product.sku)})
            </div>
            <div class="field">
              <span class="label">Shelf:</span> ${shelfLabel}
            </div>
            <div class="field">
              <span class="label">Current Stock:</span> ${product.stock} units
            </div>
            <div class="field">
              <span class="label">Message:</span><br>
              ${escapeHtml(alert.message)}
            </div>
            <div class="field">
              <span class="label">Time:</span> ${alert.createdAt.toLocaleString()}
            </div>
          </div>
          <div class="footer">
            <p>Shelf Monitoring & Real-Time Alerting System</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Get color for severity level
   */
  private static getSeverityColor(severity: AlertSeverity): string {
    const colors = {
      CRITICAL: '#dc3545',
      HIGH: '#fd7e14',
      MEDIUM: '#ffc107',
      LOW: '#28a745'
    };
    return colors[severity] || '#6c757d';
  }

  /**
   * Get emoji for severity level
   */
  private static getSeverityEmoji(severity: AlertSeverity): string {
    const emojis = {
      CRITICAL: '🚨',
      HIGH: '⚠️',
      MEDIUM: '⚡',
      LOW: 'ℹ️'
    };
    return emojis[severity] || '📢';
  }
}
