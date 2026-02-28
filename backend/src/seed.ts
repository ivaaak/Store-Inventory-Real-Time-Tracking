// prisma/seed.ts
import { PrismaClient, AlertType, AlertSeverity } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Create shelves
  const dairy = await prisma.shelf.create({
    data: {
      label: 'DAIRY-A1',
      zone: 'Dairy Section',
      lastScanned: new Date(),
      alertConfig: {
        create: {
          phantomStockThreshold: 5,
          lowStockThreshold: 3,
          checkIntervalMinutes: 30,
          salesTriggerCount: 10,
          enableSlack: true,
          enableSms: false,
          enableEmail: true
        }
      }
    }
  });

  const beverages = await prisma.shelf.create({
    data: {
      label: 'BEV-B2',
      zone: 'Beverages',
      lastScanned: new Date(),
      alertConfig: {
        create: {
          phantomStockThreshold: 8,
          lowStockThreshold: 5,
          checkIntervalMinutes: 45,
          salesTriggerCount: 15,
          enableSlack: true,
          enableSms: false,
          enableEmail: true
        }
      }
    }
  });

  // Create products
  const products = [
    {
      sku: 'MILK-001',
      name: 'Whole Milk 1L',
      stock: 24,
      minThreshold: 5,
      maxCapacity: 50,
      price: 3.99,
      category: 'Dairy',
      shelfId: dairy.id
    },
    {
      sku: 'YOGURT-002',
      name: 'Greek Yogurt 500g',
      stock: 18,
      minThreshold: 4,
      maxCapacity: 40,
      price: 5.49,
      category: 'Dairy',
      shelfId: dairy.id
    },
    {
      sku: 'CHEESE-003',
      name: 'Cheddar Cheese 200g',
      stock: 15,
      minThreshold: 3,
      maxCapacity: 30,
      price: 4.99,
      category: 'Dairy',
      shelfId: dairy.id
    },
    {
      sku: 'COKE-001',
      name: 'Coca Cola 2L',
      stock: 32,
      minThreshold: 8,
      maxCapacity: 60,
      price: 2.99,
      category: 'Beverages',
      shelfId: beverages.id
    },
    {
      sku: 'JUICE-002',
      name: 'Orange Juice 1L',
      stock: 20,
      minThreshold: 5,
      maxCapacity: 45,
      price: 4.49,
      category: 'Beverages',
      shelfId: beverages.id
    }
  ];

  for (const product of products) {
    await prisma.product.create({ data: product });
    console.log(`✓ Created product: ${product.name}`);
  }

  // Create some sample audit logs
  const milk = await prisma.product.findUnique({ where: { sku: 'MILK-001' } });
  if (milk) {
    await prisma.auditLog.create({
      data: {
        productId: milk.id,
        shelfId: dairy.id,
        systemCount: 24,
        visualCount: 23,
        discrepancy: 1,
        confidence: 0.92,
        status: 'COMPLETED'
      }
    });
    console.log(`✓ Created audit log for: ${milk.name}`);
  }

  // Create some sample sale events
  if (milk) {
    await prisma.saleEvent.create({
      data: {
        productId: milk.id,
        quantity: 2,
        orderId: 'ORDER-123',
        stockBefore: 26,
        stockAfter: 24,
        source: 'POS'
      }
    });
    console.log(`✓ Created sale event for: ${milk.name}`);
  }

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
