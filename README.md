# Shelf Monitoring & Real-Time Alerting System v2.0

> High-accuracy solution for tracking supermarket shelf stock by reconciling **Perpetual Inventory** (POS data) with **Computer Vision** (Visual AI).

## 🎯 Overview

This system detects **"Phantom Stock"** — situations where the database thinks an item is available, but the physical shelf is actually empty. It combines three data sources:

1. **Sales Data (The "Out"):** Real-time POS webhooks
2. **Stocking App (The "In"):** Staff scanning items onto shelves
3. **Vision AI (The "Eye"):** Periodic camera snapshots for verification

---

## 🏗️ Architecture

### Core Components

- **Inventory Service:** Source of truth for stock management
- **Reconciliation Engine:** Compares system count vs. visual count
- **Alert System:** Multi-channel notifications (Slack, SMS, Email)
- **Webhook Handler:** Secure POS integration with signature verification
- **Vision Controller:** AI-powered shelf auditing

### Technology Stack

- **Runtime:** Node.js 20+ / TypeScript
- **Database:** PostgreSQL with Prisma ORM
- **AI Vision:** OpenAI GPT-4 Vision
- **Notifications:** Slack, Twilio (SMS), SendGrid (Email)
- **Infrastructure:** Docker & Docker Compose

---

## 🚀 Quick Start

### Prerequisites

- Docker & Docker Compose
- Node.js 20+ (for local development)
- OpenAI API key

### Installation

1. **Clone and install:**
```bash
git clone <repository-url>
cd shelf-monitoring-system
npm install
```

2. **Configure environment:**
```bash
cp .env.example .env
# Edit .env with your API keys and configuration
```

3. **Start with Docker:**
```bash
docker-compose up --build -d
```

4. **Run migrations:**
```bash
docker-compose exec app npx prisma migrate deploy
```

5. **Seed database (optional):**
```bash
docker-compose exec app npm run prisma:seed
```

### Verify Installation

```bash
# Check health
curl http://localhost:3000/health

# View logs
docker-compose logs -f app
```

---

## 📡 API Endpoints

### Inventory Management

#### Add Stock
```bash
POST /api/stock/add
Content-Type: application/json

{
  "sku": "MILK-001",
  "quantity": 12,
  "shelfLabel": "DAIRY-A1"
}
```

#### Record Sale
```bash
POST /api/stock/sale
Content-Type: application/json

{
  "sku": "MILK-001",
  "quantity": 2,
  "orderId": "ORDER-123"
}
```

#### Get Stock Level
```bash
GET /api/stock/:sku
```

#### Get Sales Velocity
```bash
GET /api/stock/:sku/velocity?hours=24
```

### Vision Auditing

#### Perform Audit
```bash
POST /api/vision/audit
Content-Type: multipart/form-data

image: [image file]
shelfLabel: DAIRY-A1
force: false
```

#### Get Audit History
```bash
GET /api/vision/history/:shelfLabel?limit=20&offset=0
```

### Alert Management

#### Get Alerts
```bash
GET /api/alerts?severity=CRITICAL&status=OPEN&limit=50
```

#### Get Alert Statistics
```bash
GET /api/alerts/stats?days=7
```

#### Acknowledge Alert
```bash
POST /api/alerts/:alertId/acknowledge
Content-Type: application/json

{
  "acknowledgedBy": "staff-001"
}
```

#### Resolve Alert
```bash
POST /api/alerts/:alertId/resolve
Content-Type: application/json

{
  "resolvedBy": "manager-001",
  "resolution": "Stock replenished and shelf reorganized"
}
```

### Configuration

#### Get Shelf Configuration
```bash
GET /api/config/shelf/:shelfLabel
```

#### Update Shelf Configuration
```bash
POST /api/config/shelf/:shelfLabel
Content-Type: application/json

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

### Webhooks

#### POS Sale Webhook
```bash
POST /api/webhooks/pos-sale
Content-Type: application/json
X-POS-Signature: [HMAC signature]

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
    ]
  }
}
```

---

## 🔐 Security

### Webhook Signature Verification

The system verifies webhook signatures using HMAC-SHA256:

```typescript
const signature = crypto
  .createHmac('sha256', process.env.POS_WEBHOOK_SECRET)
  .update(JSON.stringify(payload))
  .digest('hex');
```

### Environment Variables

Required security settings:
- `POS_WEBHOOK_SECRET`: Secret for webhook signature verification
- `OPENAI_API_KEY`: OpenAI API key (keep secure)
- API keys for notification services

---

## 🧠 Business Logic

### Phantom Stock Detection

```typescript
if (visualCount === 0 && systemCount > threshold) {
  // CRITICAL ALERT: Database shows stock, shelf is empty
  triggerPhantomStockAlert();
}
```

### Reconciliation Rules

| Condition | Alert Type | Severity |
|-----------|-----------|----------|
| Visual = 0, System > 5 | PHANTOM_STOCK | CRITICAL |
| Discrepancy > 3, Confidence > 0.8 | DISCREPANCY | HIGH |
| Stock ≤ minThreshold | LOW_STOCK | HIGH |
| Stock > maxCapacity | OVERSTOCKED | MEDIUM |

### Vision Audit Triggers

1. **Time-based:** Every N minutes (configurable per shelf)
2. **Sales-based:** After N sales of a product
3. **Manual:** Force audit via API

---

## 🔔 Notifications

### Slack Integration

Set `SLACK_WEBHOOK_URL` in environment:
```env
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL
```

### SMS (Twilio)

For critical alerts only:
```env
TWILIO_ACCOUNT_SID=your_account_sid
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_FROM_NUMBER=+1234567890
ALERT_SMS_NUMBER=+1234567890
```

### Email (SendGrid)

```env
SENDGRID_API_KEY=your_api_key
EMAIL_FROM=alerts@yourcompany.com
ALERT_EMAIL_TO=manager@yourcompany.com
```

---

## 📊 Database Schema

Key models:
- **Product:** SKU, stock levels, thresholds
- **Shelf:** Physical location, camera URL, configuration
- **AuditLog:** System vs. visual count comparisons
- **Alert:** Notification history and resolution tracking
- **SaleEvent:** Transaction history
- **WebhookLog:** Incoming webhook audit trail

---

## 🧪 Development

### Local Development

```bash
# Start in dev mode
npm run dev

# Run Prisma Studio
npm run prisma:studio

# Generate Prisma Client
npm run prisma:generate

# Create migration
npm run prisma:migrate

# Run tests
npm test
```

### Database Management

```bash
# View data
docker-compose exec app npx prisma studio

# Reset database (CAUTION: Deletes all data)
docker-compose exec app npx prisma migrate reset

# Check migration status
docker-compose exec app npx prisma migrate status
```

---

## 📈 Monitoring

### Health Checks

```bash
# Application health
curl http://localhost:3000/health

# Webhook handler health
curl http://localhost:3000/api/webhooks/health
```

### Logs

```bash
# View all logs
docker-compose logs -f

# View app logs only
docker-compose logs -f app

# View last 100 lines
docker-compose logs --tail=100 app
```

### Metrics

The application logs structured JSON, making it compatible with:
- ELK Stack (Elasticsearch, Logstash, Kibana)
- Grafana + Loki
- Datadog
- CloudWatch

---

## 🐛 Troubleshooting

### Common Issues

**Database connection failed:**
```bash
# Check PostgreSQL is running
docker-compose ps postgres

# View database logs
docker-compose logs postgres
```

**Webhook signature verification fails:**
- Verify `POS_WEBHOOK_SECRET` matches POS system configuration
- Check signature header: `X-POS-Signature`

**Vision AI errors:**
- Verify `OPENAI_API_KEY` is valid
- Check image file size (max 10MB)
- Ensure supported formats: JPG, PNG, WebP

---

## 🔄 Upgrade Path from v1.0

### Breaking Changes

1. **Database:** SQLite → PostgreSQL
2. **Vision Service:** Mock → Real OpenAI integration
3. **Webhooks:** Standalone → Integrated with validation
4. **Alerts:** Basic logging → Multi-channel notifications

### Migration Steps

1. Export data from v1.0 SQLite database
2. Set up PostgreSQL in docker-compose
3. Run Prisma migrations
4. Import data using seed script
5. Configure notification channels
6. Update POS webhook URL

---

## 📝 License

MIT

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

---

## 📧 Support

For issues and questions:
- Create an issue in GitHub
- Email: support@yourcompany.com

---

**Built with ❤️ for retail excellence**
