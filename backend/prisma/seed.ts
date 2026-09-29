// prisma/seed.ts
// Demo data for local development. Safe to re-run: shelves and products are
// upserted, and history (sales, audits, alerts) is only generated once.
import { PrismaClient, AlertSeverity, AlertStatus, AlertType } from '@prisma/client';

const prisma = new PrismaClient();

const DAY = 24 * 60 * 60 * 1000;
const ago = (ms: number) => new Date(Date.now() - ms);

// Small deterministic PRNG so every seeded database looks the same.
let seed = 42;
const rand = () => {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
};
const randInt = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));

const SHELVES = [
  { label: 'DAIRY-A1', zone: 'Dairy', posX: 150, posY: 140, config: { phantomStockThreshold: 5, checkIntervalMinutes: 30 } },
  { label: 'DAIRY-A2', zone: 'Dairy', posX: 300, posY: 140, config: { phantomStockThreshold: 5, checkIntervalMinutes: 30 } },
  { label: 'BAKERY-B1', zone: 'Bakery', posX: 150, posY: 300, config: { phantomStockThreshold: 4, checkIntervalMinutes: 60 } },
  { label: 'BEV-B2', zone: 'Beverages', posX: 300, posY: 300, config: { phantomStockThreshold: 8, checkIntervalMinutes: 45 } },
  { label: 'PRODUCE-C1', zone: 'Produce', posX: 500, posY: 140, config: null },
  { label: 'SNACKS-D1', zone: 'Snacks', posX: 500, posY: 300, config: null },
];

const PRODUCTS = [
  { sku: 'MILK-001', name: 'Whole Milk 1L', shelf: 'DAIRY-A1', stock: 24, min: 5, max: 50, price: 1.49, category: 'Dairy' },
  { sku: 'MILK-002', name: 'Semi-Skimmed Milk 1L', shelf: 'DAIRY-A1', stock: 4, min: 5, max: 50, price: 1.39, category: 'Dairy' },
  { sku: 'YOGURT-002', name: 'Greek Yogurt 500g', shelf: 'DAIRY-A1', stock: 18, min: 4, max: 40, price: 2.49, category: 'Dairy' },
  { sku: 'CHEESE-003', name: 'Cheddar Cheese 200g', shelf: 'DAIRY-A2', stock: 15, min: 3, max: 30, price: 3.29, category: 'Dairy' },
  { sku: 'BUTTER-004', name: 'Salted Butter 250g', shelf: 'DAIRY-A2', stock: 0, min: 4, max: 30, price: 2.19, category: 'Dairy' },
  { sku: 'BREAD-001', name: 'White Sourdough Loaf', shelf: 'BAKERY-B1', stock: 3, min: 5, max: 25, price: 2.8, category: 'Bakery' },
  { sku: 'CROISS-002', name: 'Butter Croissant 4-pack', shelf: 'BAKERY-B1', stock: 12, min: 4, max: 20, price: 2.5, category: 'Bakery' },
  { sku: 'COKE-001', name: 'Coca Cola 2L', shelf: 'BEV-B2', stock: 32, min: 8, max: 60, price: 2.1, category: 'Beverages' },
  { sku: 'JUICE-002', name: 'Orange Juice 1L', shelf: 'BEV-B2', stock: 20, min: 5, max: 45, price: 2.35, category: 'Beverages' },
  { sku: 'WATER-003', name: 'Sparkling Water 6x500ml', shelf: 'BEV-B2', stock: 68, min: 10, max: 60, price: 3.0, category: 'Beverages' },
  { sku: 'APPLE-001', name: 'Gala Apples 6-pack', shelf: 'PRODUCE-C1', stock: 22, min: 6, max: 40, price: 2.2, category: 'Produce' },
  { sku: 'BANANA-002', name: 'Bananas 5-pack', shelf: 'PRODUCE-C1', stock: 9, min: 6, max: 40, price: 1.1, category: 'Produce' },
  { sku: 'CHIPS-001', name: 'Sea Salt Crisps 150g', shelf: 'SNACKS-D1', stock: 27, min: 6, max: 45, price: 1.75, category: 'Snacks' },
  { sku: 'CHOC-002', name: 'Dark Chocolate 100g', shelf: 'SNACKS-D1', stock: 14, min: 5, max: 35, price: 1.95, category: 'Snacks' },
];

const FLOOR_PLAN = {
  walls: [
    { id: 'w1', x1: 40, y1: 40, x2: 760, y2: 40 },
    { id: 'w2', x1: 760, y1: 40, x2: 760, y2: 560 },
    { id: 'w3', x1: 760, y1: 560, x2: 40, y2: 560 },
    { id: 'w4', x1: 40, y1: 560, x2: 40, y2: 40 },
    { id: 'w5', x1: 620, y1: 40, x2: 620, y2: 380 },
  ],
  points: [
    { id: 'p-entrance', type: 'entrance', label: 'Entrance', x: 400, y: 540 },
    { id: 'p-checkout-1', type: 'checkout', label: 'Till 1', x: 690, y: 460 },
    { id: 'p-checkout-2', type: 'checkout', label: 'Till 2', x: 690, y: 510 },
    { id: 'p-cam-1', type: 'camera', label: 'CAM-01', x: 225, y: 80, cameraUrl: 'rtsp://cam-01.local/stream' },
    { id: 'p-cam-2', type: 'camera', label: 'CAM-02', x: 225, y: 380, cameraUrl: 'rtsp://cam-02.local/stream' },
  ],
};

async function main() {
  console.log('🌱 Seeding database...');

  const shelfIds = new Map<string, string>();
  for (const s of SHELVES) {
    const shelf = await prisma.shelf.upsert({
      where: { label: s.label },
      update: { zone: s.zone, posX: s.posX, posY: s.posY },
      create: { label: s.label, zone: s.zone, posX: s.posX, posY: s.posY },
    });
    shelfIds.set(s.label, shelf.id);
    if (s.config) {
      await prisma.shelfAlertConfig.upsert({
        where: { shelfId: shelf.id },
        update: s.config,
        create: { shelfId: shelf.id, ...s.config },
      });
    }
  }
  console.log(`✓ ${SHELVES.length} shelves`);

  const productIds = new Map<string, string>();
  for (const p of PRODUCTS) {
    const data = {
      name: p.name,
      minThreshold: p.min,
      maxCapacity: p.max,
      price: p.price,
      category: p.category,
      shelfId: shelfIds.get(p.shelf)!,
    };
    const product = await prisma.product.upsert({
      where: { sku: p.sku },
      update: data,
      create: { sku: p.sku, stock: p.stock, ...data },
    });
    productIds.set(p.sku, product.id);
  }
  console.log(`✓ ${PRODUCTS.length} products`);

  await prisma.floorPlan.upsert({
    where: { id: 'default' },
    update: {},
    create: { id: 'default', layout: FLOOR_PLAN },
  });
  console.log('✓ floor plan');

  if ((await prisma.saleEvent.count()) > 0) {
    console.log('↷ history already present, skipping sales/audits/alerts');
    return;
  }

  // --- Sales: two weeks of POS traffic, walking stock back from today's level.
  const sales = [];
  for (const p of PRODUCTS) {
    let stockAfter = p.stock;
    for (let d = 0; d < 14; d++) {
      const orders = randInt(0, 3);
      for (let o = 0; o < orders; o++) {
        const quantity = randInt(1, 3);
        sales.push({
          productId: productIds.get(p.sku)!,
          quantity,
          orderId: `POS-${1000 + sales.length}`,
          stockBefore: stockAfter + quantity,
          stockAfter,
          source: 'POS',
          createdAt: ago(d * DAY + randInt(1, 20) * 60 * 60 * 1000),
        });
        stockAfter += quantity;
      }
    }
  }

  // --- Audits: mostly matching counts, with a few discrepancies.
  const audits = [];
  for (const p of PRODUCTS) {
    for (let d = 0; d < 5; d++) {
      const system = p.stock + randInt(0, 4);
      const visual = rand() < 0.75 ? system : Math.max(0, system - randInt(1, 5));
      audits.push({
        productId: productIds.get(p.sku)!,
        shelfId: shelfIds.get(p.shelf)!,
        systemCount: system,
        visualCount: visual,
        discrepancy: system - visual,
        confidence: Number((0.82 + rand() * 0.16).toFixed(2)),
        status: 'COMPLETED' as const,
        createdAt: ago(d * 2 * DAY + randInt(1, 10) * 60 * 60 * 1000),
      });
    }
  }
  // Today's phantom-stock finding on the dairy shelf.
  audits.push({
    productId: productIds.get('MILK-001')!,
    shelfId: shelfIds.get('DAIRY-A1')!,
    systemCount: 24,
    visualCount: 0,
    discrepancy: 24,
    confidence: 0.94,
    status: 'COMPLETED' as const,
    alertTriggered: true,
    alertType: AlertType.PHANTOM_STOCK,
    createdAt: ago(40 * 60 * 1000),
  });

  // --- Alerts across severities and lifecycle states.
  const alert = (
    sku: string,
    type: AlertType,
    severity: AlertSeverity,
    message: string,
    createdAt: Date,
    status: AlertStatus = AlertStatus.OPEN,
    extra: Record<string, unknown> = {}
  ) => ({
    productId: productIds.get(sku)!,
    shelfLabel: PRODUCTS.find((p) => p.sku === sku)!.shelf,
    type,
    severity,
    message,
    status,
    createdAt,
    notificationsSent: [],
    ...extra,
  });

  const alerts = [
    alert('MILK-001', 'PHANTOM_STOCK', 'CRITICAL', 'Phantom stock: the book shows 24 × Whole Milk 1L but the shelf is empty.', ago(40 * 60 * 1000)),
    alert('BUTTER-004', 'LOW_STOCK', 'CRITICAL', 'Low stock for Salted Butter 250g: 0 left (minimum 4).', ago(2 * 60 * 60 * 1000)),
    alert('BREAD-001', 'LOW_STOCK', 'HIGH', 'Low stock for White Sourdough Loaf: 3 left (minimum 5).', ago(3 * 60 * 60 * 1000), 'ACKNOWLEDGED', {
      acknowledgedAt: ago(2.5 * 60 * 60 * 1000),
      acknowledgedBy: 'maria.k',
    }),
    alert('MILK-002', 'LOW_STOCK', 'HIGH', 'Low stock for Semi-Skimmed Milk 1L: 4 left (minimum 5).', ago(5 * 60 * 60 * 1000)),
    alert('CHEESE-003', 'DISCREPANCY', 'MEDIUM', 'Count mismatch for Cheddar Cheese 200g. System: 17, Visual: 15.', ago(26 * 60 * 60 * 1000)),
    alert('WATER-003', 'OVERSTOCKED', 'MEDIUM', 'Sparkling Water 6x500ml exceeds max capacity. Current: 68, Max: 60', ago(30 * 60 * 60 * 1000)),
    alert('APPLE-001', 'DISCREPANCY', 'HIGH', 'Count mismatch for Gala Apples 6-pack. System: 26, Visual: 20.', ago(3 * DAY), 'RESOLVED', {
      acknowledgedAt: ago(3 * DAY - 20 * 60 * 1000),
      acknowledgedBy: 'sam.t',
      resolvedAt: ago(3 * DAY - 90 * 60 * 1000),
      resolvedBy: 'sam.t',
      resolution: 'Found a mis-shelved case in the back room and re-faced the shelf.',
    }),
    alert('CHIPS-001', 'PHANTOM_STOCK', 'CRITICAL', 'Phantom stock: the book shows 11 × Sea Salt Crisps 150g but the shelf is empty.', ago(6 * DAY), 'RESOLVED', {
      acknowledgedAt: ago(6 * DAY - 10 * 60 * 1000),
      acknowledgedBy: 'maria.k',
      resolvedAt: ago(6 * DAY - 45 * 60 * 1000),
      resolvedBy: 'maria.k',
      resolution: 'Stock was in the delivery cage, never put out. Shelf filled.',
    }),
    alert('JUICE-002', 'DISCREPANCY', 'MEDIUM', 'Count mismatch for Orange Juice 1L. System: 22, Visual: 21.', ago(9 * DAY), 'DISMISSED', {
      resolvedAt: ago(9 * DAY - 60 * 60 * 1000),
      resolvedBy: 'sam.t',
      resolution: 'One carton hidden behind the price rail; counts are correct.',
    }),
  ];
  // All-or-nothing, so a failed run doesn't leave partial history that the
  // "already seeded" check would then skip over.
  await prisma.$transaction([
    prisma.saleEvent.createMany({ data: sales }),
    prisma.auditLog.createMany({ data: audits }),
    prisma.alert.createMany({ data: alerts }),
    ...SHELVES.slice(0, 4).map((s) =>
      prisma.shelf.update({ where: { label: s.label }, data: { lastScanned: ago(randInt(20, 180) * 60 * 1000) } })
    ),
  ]);
  console.log(`✓ ${sales.length} sale events, ${audits.length} audit logs, ${alerts.length} alerts`);

  console.log('✅ Seeding completed!');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
