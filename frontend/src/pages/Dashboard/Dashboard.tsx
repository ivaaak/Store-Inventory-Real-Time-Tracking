import { Link } from 'react-router-dom';
import { api, ApiError } from '../../api/client';
import type { Shelf } from '../../api/types';
import { useQuery } from '../../hooks/useQuery';
import { alertTypeLabel, formatCurrency, formatNumber, formatPercent, timeAgo } from '../../lib/format';
import { EmptyState, ErrorState, Icon, Loading, SeverityBadge, StatCard, StockMeter } from '../../components/ui';
import { AlertTrendChart } from './AlertTrendChart';
import styles from './Dashboard.module.css';

const shelfFill = (shelf: Shelf) => {
  const stock = shelf.products.reduce((s, p) => s + p.stock, 0);
  const max = shelf.products.reduce((s, p) => s + p.maxCapacity, 0);
  return { stock, max };
};

const Dashboard = () => {
  const overview = useQuery(() => api.dashboard(7).then((r) => r.data), [], {
    liveOn: ['stock.changed', 'alert.created', 'alert.updated', 'audit.completed', 'shelf.changed'],
  });
  const trends = useQuery(() => api.alertTrends(14).then((r) => r.data), [], { liveOn: ['alert.created'] });
  const alerts = useQuery(() => api.alerts({ statuses: 'OPEN,ACKNOWLEDGED,IN_PROGRESS', limit: 6 }).then((r) => r.data), [], {
    liveOn: ['alert.created', 'alert.updated'],
  });
  const shelves = useQuery(() => api.shelves().then((r) => r.data), [], {
    liveOn: ['stock.changed', 'alert.created', 'alert.updated', 'audit.completed', 'shelf.changed'],
  });
  const audits = useQuery(() => api.recentAudits(8).then((r) => r.data), [], { liveOn: ['audit.completed'] });
  const movement = useQuery(() => api.stockMovement(7).then((r) => r.data), [], { liveOn: ['stock.changed'] });

  if (overview.error && !overview.data) {
    const offline = overview.error instanceof ApiError === false;
    return (
      <div className="page">
        <div className="card">
          <ErrorState
            error={offline ? new Error('The API is unreachable. Is the backend running on port 3000?') : overview.error}
            onRetry={overview.refetch}
          />
        </div>
      </div>
    );
  }

  const o = overview.data;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <div className="page-subtitle">
            Store overview · {overview.updatedAt ? `updated ${overview.updatedAt.toLocaleTimeString()}` : 'loading…'}
          </div>
        </div>
      </div>

      <section className={styles.kpis} aria-label="Key metrics">
        {o ? (
          <>
            <StatCard
              label="Active alerts"
              icon="bell"
              value={o.alerts.open}
              hint={o.alerts.critical ? `${o.alerts.critical} critical` : 'None critical'}
              tone={o.alerts.critical ? 'danger' : undefined}
              to="/alerts"
            />
            <StatCard
              label="Out of / low stock"
              icon="package"
              value={
                <>
                  {o.inventory.outOfStockProducts}
                  <span className={styles.kpiSep}>/</span>
                  {o.inventory.lowStockProducts}
                </>
              }
              hint={`of ${o.inventory.totalProducts} products`}
              tone={o.inventory.outOfStockProducts ? 'warning' : undefined}
              to="/inventory"
            />
            <StatCard
              label="Shelves due for audit"
              icon="scan"
              value={o.shelves.needingAudit}
              hint={`of ${o.shelves.total} shelves`}
              to="/vision-ai"
            />
            <StatCard
              label="Audits today"
              icon="eye"
              value={o.audits.today}
              hint={`Avg. confidence ${formatPercent(o.audits.averageConfidence)} (7d)`}
            />
            <StatCard
              label="Stock value"
              icon="activity"
              value={formatCurrency(o.inventory.stockValue)}
              hint={`${formatNumber(o.sales.totalQuantity)} units sold (7d)`}
            />
          </>
        ) : (
          Array.from({ length: 5 }, (_, i) => <div key={i} className={`card skeleton ${styles.kpiSkeleton}`} />)
        )}
      </section>

      <div className={styles.grid}>
        <section className={`card ${styles.span2}`}>
          <div className="card-header">
            <h2 className="card-title">Needs attention</h2>
            <Link to="/alerts" className={styles.link}>
              All alerts <Icon name="arrowRight" size={14} />
            </Link>
          </div>
          {alerts.loading ? (
            <Loading />
          ) : !alerts.data?.length ? (
            <EmptyState icon="check" title="All clear">
              No active alerts right now.
            </EmptyState>
          ) : (
            <ul className={styles.alertList}>
              {alerts.data.map((a) => (
                <li key={a.id}>
                  <Link to={`/alerts?id=${a.id}`} className={styles.alertRow}>
                    <SeverityBadge severity={a.severity} />
                    <div className={styles.alertMain}>
                      <div className={styles.alertType}>
                        {alertTypeLabel(a.type)}
                        {a.status !== 'OPEN' && <span className="muted"> · {a.status.toLowerCase()}</span>}
                      </div>
                      <div className={styles.alertMeta}>
                        <span className="mono">{a.shelfLabel}</span> · {a.product?.name ?? a.productId}
                      </div>
                    </div>
                    <span className={styles.alertTime}>{timeAgo(a.createdAt)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card">
          <div className="card-header">
            <h2 className="card-title">Shelf health</h2>
            <Link to="/floor-plan" className={styles.link}>
              Floor plan <Icon name="arrowRight" size={14} />
            </Link>
          </div>
          {shelves.loading ? (
            <Loading />
          ) : !shelves.data?.length ? (
            <EmptyState icon="shelf" title="No shelves yet" />
          ) : (
            <ul className={styles.shelfList}>
              {shelves.data.map((s) => {
                const { stock, max } = shelfFill(s);
                const ratio = max ? stock / max : 0;
                return (
                  <li key={s.id} className={styles.shelfRow}>
                    <div className={styles.shelfHead}>
                      <span className="mono">{s.label}</span>
                      <span className={styles.shelfZone}>{s.zone}</span>
                      <span className={styles.shelfBadges}>
                        {s.worstSeverity && <SeverityBadge severity={s.worstSeverity} />}
                        {s.auditDue && <span className="badge">Audit due</span>}
                      </span>
                    </div>
                    <StockMeter stock={stock} max={max} status={ratio < 0.15 ? 'LOW' : ratio > 1 ? 'OVER' : 'OK'} />
                    <div className={styles.shelfMeta}>
                      <span className="num">{Math.round(ratio * 100)}% full</span>
                      <span>scanned {timeAgo(s.lastScanned)}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className={`card ${styles.span2}`}>
          <div className="card-header">
            <h2 className="card-title">Alerts raised · last 14 days</h2>
          </div>
          <div className="card-body">
            {trends.error ? (
              <ErrorState error={trends.error} onRetry={trends.refetch} />
            ) : trends.data ? (
              <AlertTrendChart data={trends.data} />
            ) : (
              <div className="skeleton" style={{ height: 220 }} />
            )}
          </div>
        </section>

        <section className="card">
          <div className="card-header">
            <h2 className="card-title">Top sellers · 7 days</h2>
          </div>
          {movement.loading ? (
            <Loading />
          ) : !movement.data?.topSellingProducts.length ? (
            <EmptyState icon="cart" title="No sales recorded" />
          ) : (
            <ol className={styles.topList}>
              {movement.data.topSellingProducts.slice(0, 6).map((p, i, arr) => (
                <li key={p.sku} className={styles.topRow}>
                  <span className={styles.topRank}>{i + 1}</span>
                  <div className={styles.topMain}>
                    <div className={styles.topName}>{p.name}</div>
                    <div className="meter">
                      <span style={{ width: `${(p.totalSold / arr[0].totalSold) * 100}%`, ['--meter-color' as string]: 'var(--color-primary)' }} />
                    </div>
                  </div>
                  <span className="num">{p.totalSold}</span>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className={`card ${styles.span3}`}>
          <div className="card-header">
            <h2 className="card-title">Recent audits</h2>
            <Link to="/vision-ai" className={styles.link}>
              Vision AI <Icon name="arrowRight" size={14} />
            </Link>
          </div>
          {audits.loading ? (
            <Loading />
          ) : !audits.data?.length ? (
            <EmptyState icon="eye" title="No audits yet" />
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Shelf</th>
                    <th>Product</th>
                    <th className="right">System</th>
                    <th className="right">Visual</th>
                    <th className="right">Confidence</th>
                    <th>Result</th>
                    <th className="right">When</th>
                  </tr>
                </thead>
                <tbody>
                  {audits.data.map((a) => (
                    <tr key={a.id}>
                      <td className="mono">{a.shelf?.label}</td>
                      <td>{a.product.name}</td>
                      <td className="right num">{a.systemCount}</td>
                      <td className="right num">{a.status === 'FAILED' ? '—' : a.visualCount}</td>
                      <td className="right num">{formatPercent(a.confidence)}</td>
                      <td>
                        {a.status === 'FAILED' ? (
                          <span className="badge badge-danger">Failed</span>
                        ) : a.alertType ? (
                          <span className="badge badge-warning">{alertTypeLabel(a.alertType)}</span>
                        ) : a.discrepancy === 0 ? (
                          <span className="badge badge-success">Match</span>
                        ) : (
                          <span className="badge">Off by {Math.abs(a.discrepancy)}</span>
                        )}
                      </td>
                      <td className="right muted">{timeAgo(a.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export default Dashboard;
