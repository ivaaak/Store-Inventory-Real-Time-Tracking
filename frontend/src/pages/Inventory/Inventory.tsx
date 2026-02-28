import { useState } from 'react';
import styles from './Inventory.module.css';

interface Product {
  id: string;
  sku: string;
  name: string;
  shelf: string;
  currentStock: number;
  minThreshold: number;
  maxCapacity: number;
  lastAudit: string;
  status: 'ok' | 'low' | 'critical';
}

const Inventory = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  const products: Product[] = [
    {
      id: '1',
      sku: 'MILK-001',
      name: 'Whole Milk 1L',
      shelf: 'DAIRY-A1',
      currentStock: 0,
      minThreshold: 5,
      maxCapacity: 20,
      lastAudit: new Date(Date.now() - 3600000).toISOString(),
      status: 'critical'
    },
    {
      id: '2',
      sku: 'CHEESE-001',
      name: 'Cheddar Cheese 250g',
      shelf: 'DAIRY-A2',
      currentStock: 8,
      minThreshold: 5,
      maxCapacity: 15,
      lastAudit: new Date(Date.now() - 7200000).toISOString(),
      status: 'ok'
    },
    {
      id: '3',
      sku: 'BREAD-001',
      name: 'White Bread',
      shelf: 'BAKERY-B1',
      currentStock: 3,
      minThreshold: 5,
      maxCapacity: 25,
      lastAudit: new Date(Date.now() - 10800000).toISOString(),
      status: 'low'
    },
    {
      id: '4',
      sku: 'YOGURT-001',
      name: 'Greek Yogurt 500g',
      shelf: 'DAIRY-A3',
      currentStock: 12,
      minThreshold: 5,
      maxCapacity: 20,
      lastAudit: new Date(Date.now() - 14400000).toISOString(),
      status: 'ok'
    }
  ];

  const filteredProducts = products.filter(product =>
    product.sku.toLowerCase().includes(searchQuery.toLowerCase()) ||
    product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    product.shelf.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getStockPercentage = (product: Product) => {
    return (product.currentStock / product.maxCapacity) * 100;
  };

  const getStockColor = (product: Product) => {
    const percentage = getStockPercentage(product);
    if (percentage === 0) return 'var(--color-danger)';
    if (percentage < 30) return 'var(--color-warning)';
    return 'var(--color-success)';
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleString();
  };

  const getTimeAgo = (timestamp: string) => {
    const diff = Date.now() - new Date(timestamp).getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>Inventory</h1>
        <div className={styles.headerActions}>
          <input
            type="text"
            className={styles.searchInput}
            placeholder="Search by SKU, name, or shelf..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      <div className={styles.stats}>
        <div className={styles.statCard}>
          <div className={styles.statValue}>{products.length}</div>
          <div className={styles.statLabel}>Total Products</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statValue}>
            {products.filter(p => p.status === 'ok').length}
          </div>
          <div className={styles.statLabel}>In Stock</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statValue}>
            {products.filter(p => p.status === 'low').length}
          </div>
          <div className={styles.statLabel}>Low Stock</div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statValue}>
            {products.filter(p => p.status === 'critical').length}
          </div>
          <div className={styles.statLabel}>Out of Stock</div>
        </div>
      </div>

      <div className={styles.content}>
        <div className={styles.productsList}>
          <div className={styles.tableHeader}>
            <div className={styles.columnSku}>SKU</div>
            <div className={styles.columnName}>Product Name</div>
            <div className={styles.columnShelf}>Shelf</div>
            <div className={styles.columnStock}>Stock</div>
            <div className={styles.columnStatus}>Status</div>
            <div className={styles.columnAudit}>Last Audit</div>
          </div>

          <div className={styles.tableBody}>
            {filteredProducts.map(product => (
              <div
                key={product.id}
                className={`${styles.productRow} ${selectedProduct?.id === product.id ? styles.productRowActive : ''}`}
                onClick={() => setSelectedProduct(product)}
              >
                <div className={styles.columnSku}>
                  <span className={styles.skuBadge}>{product.sku}</span>
                </div>
                <div className={styles.columnName}>{product.name}</div>
                <div className={styles.columnShelf}>{product.shelf}</div>
                <div className={styles.columnStock}>
                  <div className={styles.stockInfo}>
                    <span className={styles.stockValue}>
                      {product.currentStock}/{product.maxCapacity}
                    </span>
                    <div className={styles.stockBar}>
                      <div
                        className={styles.stockBarFill}
                        style={{
                          width: `${getStockPercentage(product)}%`,
                          backgroundColor: getStockColor(product)
                        }}
                      />
                    </div>
                  </div>
                </div>
                <div className={styles.columnStatus}>
                  <span className={`${styles.statusBadge} ${styles[`status${product.status}`]}`}>
                    {product.status}
                  </span>
                </div>
                <div className={styles.columnAudit}>
                  {getTimeAgo(product.lastAudit)}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className={styles.detailPanel}>
          {selectedProduct ? (
            <>
              <div className={styles.detailHeader}>
                <h2 className={styles.detailTitle}>Product Details</h2>
                <span className={`${styles.statusBadge} ${styles[`status${selectedProduct.status}`]}`}>
                  {selectedProduct.status}
                </span>
              </div>

              <div className={styles.detailSection}>
                <h3 className={styles.detailSectionTitle}>Basic Information</h3>
                <div className={styles.detailGrid}>
                  <div className={styles.detailItem}>
                    <div className={styles.detailLabel}>SKU</div>
                    <div className={styles.detailValue}>{selectedProduct.sku}</div>
                  </div>
                  <div className={styles.detailItem}>
                    <div className={styles.detailLabel}>Product Name</div>
                    <div className={styles.detailValue}>{selectedProduct.name}</div>
                  </div>
                  <div className={styles.detailItem}>
                    <div className={styles.detailLabel}>Shelf Location</div>
                    <div className={styles.detailValue}>{selectedProduct.shelf}</div>
                  </div>
                  <div className={styles.detailItem}>
                    <div className={styles.detailLabel}>Last Audit</div>
                    <div className={styles.detailValue}>
                      {formatTimestamp(selectedProduct.lastAudit)}
                    </div>
                  </div>
                </div>
              </div>

              <div className={styles.detailSection}>
                <h3 className={styles.detailSectionTitle}>Stock Levels</h3>
                <div className={styles.stockVisualization}>
                  <div className={styles.stockCircle}>
                    <svg width="180" height="180" viewBox="0 0 180 180">
                      <circle
                        cx="90"
                        cy="90"
                        r="70"
                        fill="none"
                        stroke="var(--color-bg-tertiary)"
                        strokeWidth="20"
                      />
                      <circle
                        cx="90"
                        cy="90"
                        r="70"
                        fill="none"
                        stroke={getStockColor(selectedProduct)}
                        strokeWidth="20"
                        strokeDasharray={`${2 * Math.PI * 70}`}
                        strokeDashoffset={`${2 * Math.PI * 70 * (1 - getStockPercentage(selectedProduct) / 100)}`}
                        transform="rotate(-90 90 90)"
                      />
                      <text
                        x="90"
                        y="85"
                        textAnchor="middle"
                        fontSize="32"
                        fontWeight="700"
                        fill="var(--color-text)"
                      >
                        {selectedProduct.currentStock}
                      </text>
                      <text
                        x="90"
                        y="105"
                        textAnchor="middle"
                        fontSize="14"
                        fill="var(--color-text-secondary)"
                      >
                        units
                      </text>
                    </svg>
                  </div>
                  <div className={styles.stockMetrics}>
                    <div className={styles.metric}>
                      <div className={styles.metricLabel}>Current Stock</div>
                      <div className={styles.metricValue}>{selectedProduct.currentStock}</div>
                    </div>
                    <div className={styles.metric}>
                      <div className={styles.metricLabel}>Min Threshold</div>
                      <div className={styles.metricValue}>{selectedProduct.minThreshold}</div>
                    </div>
                    <div className={styles.metric}>
                      <div className={styles.metricLabel}>Max Capacity</div>
                      <div className={styles.metricValue}>{selectedProduct.maxCapacity}</div>
                    </div>
                    <div className={styles.metric}>
                      <div className={styles.metricLabel}>Fill Rate</div>
                      <div className={styles.metricValue}>
                        {getStockPercentage(selectedProduct).toFixed(0)}%
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className={styles.detailActions}>
                <button className={styles.btnPrimary}>Add Stock</button>
                <button className={styles.btnSecondary}>Record Sale</button>
                <button className={styles.btnSecondary}>Audit Shelf</button>
              </div>
            </>
          ) : (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>📦</div>
              <div className={styles.emptyText}>
                Select a product to view details
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Inventory;
