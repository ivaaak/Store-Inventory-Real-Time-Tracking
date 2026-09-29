import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../api/client';
import type { Product, StockStatus } from '../../api/types';
import { useQuery } from '../../hooks/useQuery';
import { useToast } from '../../context/ToastContext';
import { formatDateTime, formatPercent, timeAgo } from '../../lib/format';
import { EmptyState, ErrorState, Icon, Loading, Modal, StatCard, StockBadge, StockMeter, stockColor } from '../../components/ui';
import styles from './Inventory.module.css';

type Filter = 'ALL' | StockStatus;

const FILTERS: Array<[Filter, string]> = [
  ['ALL', 'All'],
  ['OUT', 'Out'],
  ['LOW', 'Low'],
  ['OK', 'In stock'],
  ['OVER', 'Over'],
];

type StockAction = 'add' | 'sale';

const Inventory = () => {
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('ALL');
  const [action, setAction] = useState<StockAction | null>(null);
  const selectedSku = params.get('sku');

  const products = useQuery(() => api.products().then((r) => r.data), [], {
    liveOn: ['stock.changed', 'audit.completed', 'shelf.changed'],
  });

  const counts = useMemo(() => {
    const c = { ALL: 0, OUT: 0, LOW: 0, OK: 0, OVER: 0 } as Record<Filter, number>;
    for (const p of products.data ?? []) {
      c.ALL++;
      c[p.status]++;
    }
    return c;
  }, [products.data]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (products.data ?? []).filter(
      (p) =>
        (filter === 'ALL' || p.status === filter) &&
        (!q || [p.sku, p.name, p.shelf?.label, p.category].some((f) => f?.toLowerCase().includes(q)))
    );
  }, [products.data, search, filter]);

  const selected = products.data?.find((p) => p.sku === selectedSku) ?? null;

  const select = (p: Product) =>
    setParams(
      (prev) => {
        prev.set('sku', p.sku);
        return prev;
      },
      { replace: true }
    );

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Inventory</h1>
          <div className="page-subtitle">Book stock per product, updated live from sales and restocks</div>
        </div>
        <label className="input-with-icon">
          <Icon name="search" size={15} />
          <input
            className={`input ${styles.search}`}
            placeholder="Search SKU, name, shelf…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search products"
          />
        </label>
      </div>

      <section className={styles.stats} aria-label="Stock summary">
        <StatCard label="Products" icon="package" value={counts.ALL} />
        <StatCard label="In stock" value={counts.OK} tone="success" />
        <StatCard label="Low stock" value={counts.LOW} tone={counts.LOW ? 'warning' : undefined} />
        <StatCard label="Out of stock" value={counts.OUT} tone={counts.OUT ? 'danger' : undefined} />
      </section>

      <div className="split">
        <section className="card" aria-label="Products">
          <div className="card-header">
            <div className="btn-group" role="tablist" aria-label="Stock status filter">
              {FILTERS.map(([f, label]) => (
                <button
                  key={f}
                  role="tab"
                  aria-selected={filter === f}
                  className={`btn btn-sm ${filter === f ? 'active' : ''}`}
                  onClick={() => setFilter(f)}
                >
                  {label} <span className="muted num">{counts[f]}</span>
                </button>
              ))}
            </div>
          </div>
          {products.loading ? (
            <Loading />
          ) : products.error ? (
            <ErrorState error={products.error} onRetry={products.refetch} />
          ) : filtered.length === 0 ? (
            <EmptyState icon="search" title="No products match">
              Try a different search or filter.
            </EmptyState>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Shelf</th>
                    <th className={styles.stockCol}>Stock</th>
                    <th>Status</th>
                    <th className="right">Last audit</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((p) => (
                    <tr
                      key={p.id}
                      className={`clickable ${selected?.id === p.id ? 'selected' : ''}`}
                      onClick={() => select(p)}
                      onKeyDown={(e) => e.key === 'Enter' && select(p)}
                      tabIndex={0}
                      aria-selected={selected?.id === p.id}
                    >
                      <td>
                        <div className={styles.productName}>{p.name}</div>
                        <div className="mono muted">{p.sku}</div>
                      </td>
                      <td className="mono">{p.shelf?.label ?? <span className="muted">—</span>}</td>
                      <td className={styles.stockCol}>
                        <div className={styles.stockCell}>
                          <span className="num">
                            {p.stock}
                            <span className="muted">/{p.maxCapacity}</span>
                          </span>
                          <StockMeter stock={p.stock} max={p.maxCapacity} status={p.status} />
                        </div>
                      </td>
                      <td>
                        <StockBadge status={p.status} />
                      </td>
                      <td className="right muted">{p.lastAudit ? timeAgo(p.lastAudit.createdAt) : 'never'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <aside className="card detail" aria-label="Product details">
          {selected ? (
            <ProductDetail product={selected} onAction={setAction} />
          ) : (
            <EmptyState icon="package" title="No product selected">
              Pick a product to see stock levels and act on it.
            </EmptyState>
          )}
        </aside>
      </div>

      {action && selected && <StockModal product={selected} action={action} onClose={() => setAction(null)} />}
    </div>
  );
};

const RING_R = 58;
const RING_C = 2 * Math.PI * RING_R;

const ProductDetail = ({ product, onAction }: { product: Product; onAction: (a: StockAction) => void }) => {
  const navigate = useNavigate();
  const metrics = useQuery(() => api.productMetrics(product.sku, 30).then((r) => r.data), [product.sku], {
    liveOn: ['stock.changed'],
  });
  const alerts = useQuery(
    () => api.alerts({ statuses: 'OPEN,ACKNOWLEDGED,IN_PROGRESS', limit: 200 }).then((r) => r.data.filter((a) => a.productId === product.id)),
    [product.id],
    { liveOn: ['alert.created', 'alert.updated'] }
  );
  const fill = Math.min(1, product.maxCapacity ? product.stock / product.maxCapacity : 0);

  return (
    <>
      <div className="card-header">
        <div>
          <h2 className="card-title">{product.name}</h2>
          <div className="mono muted">{product.sku}</div>
        </div>
        <StockBadge status={product.status} />
      </div>
      <div className={`card-body ${styles.detailBody}`}>
        <div className={styles.ringRow}>
          <svg width="140" height="140" viewBox="0 0 140 140" role="img" aria-label={`${product.stock} of ${product.maxCapacity} units`}>
            <circle cx="70" cy="70" r={RING_R} fill="none" stroke="var(--color-bg-tertiary)" strokeWidth="12" />
            <circle
              cx="70"
              cy="70"
              r={RING_R}
              fill="none"
              stroke={stockColor(product.status)}
              strokeWidth="12"
              strokeLinecap="round"
              strokeDasharray={RING_C}
              strokeDashoffset={RING_C * (1 - fill)}
              transform="rotate(-90 70 70)"
              style={{ transition: 'stroke-dashoffset 0.4s ease' }}
            />
            <text x="70" y="68" textAnchor="middle" className={styles.ringValue}>
              {product.stock}
            </text>
            <text x="70" y="88" textAnchor="middle" className={styles.ringLabel}>
              of {product.maxCapacity}
            </text>
          </svg>
          <dl className={styles.ringStats}>
            <div>
              <dt>Min. threshold</dt>
              <dd className="num">{product.minThreshold}</dd>
            </div>
            <div>
              <dt>Sold / day (30d)</dt>
              <dd className="num">{metrics.data ? metrics.data.averageDailySales : '…'}</dd>
            </div>
            <div>
              <dt>Days of cover</dt>
              <dd className="num">{metrics.data ? (metrics.data.daysOfCover ?? '—') : '…'}</dd>
            </div>
            <div>
              <dt>Stock-outs (30d)</dt>
              <dd className="num">{metrics.data ? metrics.data.stockouts : '…'}</dd>
            </div>
          </dl>
        </div>

        <dl className="kv">
          <div>
            <dt>Shelf</dt>
            <dd className="mono">{product.shelf?.label ?? '—'}</dd>
          </div>
          <div>
            <dt>Category</dt>
            <dd>{product.category ?? '—'}</dd>
          </div>
          <div>
            <dt>Unit price</dt>
            <dd className="num">{Number(product.price).toFixed(2)}</dd>
          </div>
          <div>
            <dt>Last audit</dt>
            <dd>
              {product.lastAudit
                ? `${formatDateTime(product.lastAudit.createdAt)} · saw ${product.lastAudit.visualCount} (${formatPercent(product.lastAudit.confidence)})`
                : 'Never audited'}
            </dd>
          </div>
        </dl>

        {!!alerts.data?.length && (
          <div>
            <h3 className="section-title">Active alerts</h3>
            <ul className={styles.alertList}>
              {alerts.data.map((a) => (
                <li key={a.id}>
                  <button className={styles.alertLink} onClick={() => navigate(`/alerts?id=${a.id}`)}>
                    <span className={`badge badge-sev sev-${a.severity}`}>{a.severity.toLowerCase()}</span>
                    <span>{a.message}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className={styles.actions}>
          <button className="btn btn-primary" onClick={() => onAction('add')}>
            <Icon name="plus" size={15} /> Add stock
          </button>
          <button className="btn" onClick={() => onAction('sale')} disabled={product.stock === 0}>
            <Icon name="cart" size={15} /> Record sale
          </button>
          <button
            className="btn"
            onClick={() => navigate(`/vision-ai?shelf=${encodeURIComponent(product.shelf?.label ?? '')}`)}
            disabled={!product.shelf}
          >
            <Icon name="scan" size={15} /> Audit shelf
          </button>
        </div>
      </div>
    </>
  );
};

const StockModal = ({ product, action, onClose }: { product: Product; action: StockAction; onClose: () => void }) => {
  const notify = useToast();
  const [quantity, setQuantity] = useState(action === 'add' ? Math.max(1, product.maxCapacity - product.stock) : 1);
  const [shelfLabel, setShelfLabel] = useState(product.shelf?.label ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const max = action === 'sale' ? product.stock : 10_000;
  const valid = quantity >= 1 && quantity <= max && (action === 'sale' || shelfLabel.trim());
  const after = action === 'add' ? product.stock + quantity : product.stock - quantity;

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      if (action === 'add') await api.addStock({ sku: product.sku, quantity, shelfLabel: shelfLabel.trim() });
      else await api.recordSale({ sku: product.sku, quantity });
      notify({ kind: 'success', title: action === 'add' ? 'Stock added' : 'Sale recorded', message: `${product.name}: ${after} units` });
      onClose();
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  };

  return (
    <Modal
      title={action === 'add' ? 'Add stock to shelf' : 'Record a sale'}
      onClose={onClose}
      onSubmit={() => valid && submit()}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={!valid || saving}>
            {saving && <span className="spinner" />}
            {action === 'add' ? 'Add stock' : 'Record sale'}
          </button>
        </>
      }
    >
      <p>
        <strong>{product.name}</strong> <span className="mono muted">{product.sku}</span>
      </p>
      <label className="field">
        <span className="field-label">Quantity</span>
        <input
          className="input"
          type="number"
          min={1}
          max={max}
          value={quantity}
          onChange={(e) => setQuantity(Math.floor(Number(e.target.value)) || 0)}
        />
        <span className="field-hint">
          {product.stock} → <strong className="num">{after}</strong> units
          {action === 'add' && after > product.maxCapacity && ` (over capacity of ${product.maxCapacity})`}
        </span>
      </label>
      {action === 'add' && (
        <label className="field">
          <span className="field-label">Shelf</span>
          <input className="input mono" value={shelfLabel} onChange={(e) => setShelfLabel(e.target.value.toUpperCase())} placeholder="e.g. DAIRY-A1" />
        </label>
      )}
      {error && <div className="form-error">{error}</div>}
    </Modal>
  );
};

export default Inventory;
