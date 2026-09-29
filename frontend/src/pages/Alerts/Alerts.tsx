import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, ApiError } from '../../api/client';
import { Alert, AlertSeverity, SEVERITIES } from '../../api/types';
import { useQuery } from '../../hooks/useQuery';
import { useToast } from '../../context/ToastContext';
import { alertTypeLabel, formatDateTime, getOperatorName, setOperatorName, timeAgo, titleCase } from '../../lib/format';
import { AlertStatusBadge, EmptyState, ErrorState, Icon, Loading, Modal, SeverityBadge } from '../../components/ui';
import styles from './Alerts.module.css';

type View = 'active' | 'closed' | 'all';

const VIEW_STATUSES: Record<View, string | undefined> = {
  active: 'OPEN,ACKNOWLEDGED,IN_PROGRESS',
  closed: 'RESOLVED,DISMISSED',
  all: undefined,
};

type ResolveMode = 'resolve' | 'dismiss';

const Alerts = () => {
  const [params, setParams] = useSearchParams();
  const [view, setView] = useState<View>('active');
  const [severity, setSeverity] = useState<AlertSeverity | ''>('');
  const [search, setSearch] = useState('');
  const [resolving, setResolving] = useState<ResolveMode | null>(null);
  const [busy, setBusy] = useState(false);
  const [askName, setAskName] = useState(false);
  const notify = useToast();
  const selectedId = params.get('id');

  const alerts = useQuery(
    () => api.alerts({ statuses: VIEW_STATUSES[view], severity: severity || undefined, limit: 200 }),
    [view, severity],
    { liveOn: ['alert.created', 'alert.updated'] }
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = alerts.data?.data ?? [];
    if (!q) return list;
    return list.filter((a) =>
      [a.shelfLabel, a.product?.sku, a.product?.name, a.message, alertTypeLabel(a.type)].some((f) => f?.toLowerCase().includes(q))
    );
  }, [alerts.data, search]);

  const selected = filtered.find((a) => a.id === selectedId) ?? alerts.data?.data.find((a) => a.id === selectedId) ?? null;

  const select = (a: Alert) =>
    setParams(
      (p) => {
        p.set('id', a.id);
        return p;
      },
      { replace: true }
    );

  const counts = useMemo(() => {
    const list = alerts.data?.data ?? [];
    return Object.fromEntries(SEVERITIES.map((s) => [s, list.filter((a) => a.severity === s).length])) as Record<AlertSeverity, number>;
  }, [alerts.data]);

  const acknowledge = async (alert: Alert, name = getOperatorName()) => {
    if (!name) {
      setAskName(true);
      return;
    }
    setOperatorName(name);
    setBusy(true);
    try {
      await api.acknowledgeAlert(alert.id, name);
      notify({ kind: 'success', title: 'Alert acknowledged' });
      await alerts.refetch();
    } catch (err) {
      notify({ kind: 'error', title: 'Could not acknowledge', message: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Alerts</h1>
          <div className="page-subtitle">Phantom stock, discrepancies and stock-level warnings</div>
        </div>
        <div className="toolbar">
          <div className="btn-group" role="tablist" aria-label="Alert status">
            {(['active', 'closed', 'all'] as View[]).map((v) => (
              <button key={v} role="tab" aria-selected={view === v} className={`btn ${view === v ? 'active' : ''}`} onClick={() => setView(v)}>
                {titleCase(v)}
              </button>
            ))}
          </div>
          <select className="select" value={severity} onChange={(e) => setSeverity(e.target.value as AlertSeverity | '')} aria-label="Severity">
            <option value="">All severities</option>
            {SEVERITIES.map((s) => (
              <option key={s} value={s}>
                {titleCase(s)}
              </option>
            ))}
          </select>
          <label className="input-with-icon">
            <Icon name="search" size={15} />
            <input className="input" placeholder="Search shelf, SKU, product…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search alerts" />
          </label>
        </div>
      </div>

      {!severity && alerts.data && (
        <div className={styles.summary}>
          {SEVERITIES.map((s) => (
            <button key={s} className={`card ${styles.summaryItem}`} onClick={() => setSeverity(s)}>
              <SeverityBadge severity={s} />
              <span className={`num ${styles.summaryCount}`}>{counts[s]}</span>
            </button>
          ))}
        </div>
      )}

      <div className="split">
        <section className="card" aria-label="Alert list">
          {alerts.loading ? (
            <Loading />
          ) : alerts.error ? (
            <ErrorState error={alerts.error} onRetry={alerts.refetch} />
          ) : filtered.length === 0 ? (
            <EmptyState icon={view === 'active' ? 'check' : 'bell'} title={view === 'active' ? 'No active alerts' : 'No alerts match'}>
              {search || severity ? 'Try clearing the filters.' : view === 'active' ? 'Everything on the shelves matches the book.' : null}
            </EmptyState>
          ) : (
            <ul className={styles.list}>
              {filtered.map((a) => (
                <li key={a.id}>
                  <button className={`list-item ${selected?.id === a.id ? 'selected' : ''}`} onClick={() => select(a)}>
                    <div className={styles.itemHead}>
                      <SeverityBadge severity={a.severity} />
                      <span className={styles.itemType}>{alertTypeLabel(a.type)}</span>
                      <AlertStatusBadge status={a.status} />
                      <span className={styles.itemTime}>{timeAgo(a.createdAt)}</span>
                    </div>
                    <div className={styles.itemMeta}>
                      <span className="mono">{a.shelfLabel}</span>
                      {a.product && (
                        <>
                          <span>·</span>
                          <span>{a.product.name}</span>
                        </>
                      )}
                    </div>
                    <div className={styles.itemMessage}>{a.message}</div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <aside className="card detail" aria-label="Alert details">
          {selected ? (
            <AlertDetail
              alert={selected}
              busy={busy}
              onAcknowledge={() => acknowledge(selected)}
              onResolve={() => setResolving('resolve')}
              onDismiss={() => setResolving('dismiss')}
            />
          ) : (
            <EmptyState icon="bell" title="No alert selected">
              Pick an alert to see details and act on it.
            </EmptyState>
          )}
        </aside>
      </div>

      {askName && selected && (
        <NameModal
          onClose={() => setAskName(false)}
          onSubmit={(name) => {
            setAskName(false);
            acknowledge(selected, name);
          }}
        />
      )}

      {resolving && selected && (
        <ResolveModal
          alert={selected}
          mode={resolving}
          onClose={() => setResolving(null)}
          onDone={async () => {
            setResolving(null);
            notify({ kind: 'success', title: resolving === 'dismiss' ? 'Alert dismissed' : 'Alert resolved' });
            await alerts.refetch();
          }}
        />
      )}
    </div>
  );
};

const AlertDetail = ({
  alert,
  busy,
  onAcknowledge,
  onResolve,
  onDismiss,
}: {
  alert: Alert;
  busy: boolean;
  onAcknowledge: () => void;
  onResolve: () => void;
  onDismiss: () => void;
}) => {
  const active = ['OPEN', 'ACKNOWLEDGED', 'IN_PROGRESS'].includes(alert.status);
  const timeline = [
    { label: 'Raised', at: alert.createdAt, by: 'system', done: true },
    alert.acknowledgedAt && { label: 'Acknowledged', at: alert.acknowledgedAt, by: alert.acknowledgedBy, done: true },
    alert.resolvedAt && { label: titleCase(alert.status), at: alert.resolvedAt, by: alert.resolvedBy, done: true },
  ].filter(Boolean) as Array<{ label: string; at: string; by: string | null }>;

  return (
    <>
      <div className="card-header">
        <div className={styles.detailTitle}>
          <SeverityBadge severity={alert.severity} />
          <h2 className="card-title">{alertTypeLabel(alert.type)}</h2>
        </div>
        <AlertStatusBadge status={alert.status} />
      </div>
      <div className={`card-body ${styles.detailBody}`}>
        <p className={styles.message}>{alert.message}</p>

        <dl className="kv">
          <div>
            <dt>Shelf</dt>
            <dd className="mono">{alert.shelfLabel}</dd>
          </div>
          <div>
            <dt>Product</dt>
            <dd>
              {alert.product ? (
                <Link to={`/inventory?sku=${encodeURIComponent(alert.product.sku)}`}>{alert.product.sku}</Link>
              ) : (
                '—'
              )}
            </dd>
          </div>
          {alert.product && (
            <>
              <div>
                <dt>Book stock now</dt>
                <dd className="num">{alert.product.stock}</dd>
              </div>
              <div>
                <dt>Min. threshold</dt>
                <dd className="num">{alert.product.minThreshold}</dd>
              </div>
            </>
          )}
          <div>
            <dt>Notified via</dt>
            <dd>{alert.notificationsSent.length ? alert.notificationsSent.join(', ') : 'Dashboard only'}</dd>
          </div>
          <div>
            <dt>Raised</dt>
            <dd>{formatDateTime(alert.createdAt)}</dd>
          </div>
        </dl>

        <div>
          <h3 className="section-title">History</h3>
          <ol className={styles.timeline}>
            {timeline.map((t) => (
              <li key={t.label} className={styles.timelineItem}>
                <span className={styles.timelineDot} />
                <div>
                  <div className={styles.timelineAction}>{t.label}</div>
                  <div className={styles.timelineMeta}>
                    {formatDateTime(t.at)}
                    {t.by && ` · ${t.by}`}
                  </div>
                </div>
              </li>
            ))}
          </ol>
          {alert.resolution && <blockquote className={styles.resolution}>{alert.resolution}</blockquote>}
        </div>

        {active && (
          <div className={styles.actions}>
            {alert.status === 'OPEN' && (
              <button className="btn" onClick={onAcknowledge} disabled={busy}>
                <Icon name="eye" size={15} /> Acknowledge
              </button>
            )}
            <button className="btn btn-primary" onClick={onResolve} disabled={busy}>
              <Icon name="check" size={15} /> Resolve
            </button>
            <button className="btn btn-ghost" onClick={onDismiss} disabled={busy}>
              Dismiss as false alarm
            </button>
          </div>
        )}
      </div>
    </>
  );
};

const NameModal = ({ onClose, onSubmit }: { onClose: () => void; onSubmit: (name: string) => void }) => {
  const [name, setName] = useState('');
  return (
    <Modal
      title="Acknowledge alert"
      onClose={onClose}
      onSubmit={() => name.trim() && onSubmit(name.trim())}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={!name.trim()}>
            Acknowledge
          </button>
        </>
      }
    >
      <label className="field">
        <span className="field-label">Your name</span>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
        <span className="field-hint">Recorded on the alert and remembered in this browser.</span>
      </label>
    </Modal>
  );
};

const ResolveModal = ({
  alert,
  mode,
  onClose,
  onDone,
}: {
  alert: Alert;
  mode: ResolveMode;
  onClose: () => void;
  onDone: () => void;
}) => {
  const [name, setName] = useState(getOperatorName());
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      setOperatorName(name.trim());
      await api.resolveAlert(alert.id, { resolvedBy: name.trim(), resolution: notes.trim(), dismiss: mode === 'dismiss' });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong');
      setSaving(false);
    }
  };

  const valid = name.trim().length > 0 && notes.trim().length >= 10;

  return (
    <Modal
      title={mode === 'dismiss' ? 'Dismiss alert' : 'Resolve alert'}
      onClose={onClose}
      onSubmit={() => valid && submit()}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={!valid || saving}>
            {saving && <span className="spinner" />}
            {mode === 'dismiss' ? 'Dismiss' : 'Resolve'}
          </button>
        </>
      }
    >
      <p className="muted">
        {alertTypeLabel(alert.type)} on <span className="mono">{alert.shelfLabel}</span>
      </p>
      <label className="field">
        <span className="field-label">Your name</span>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
      </label>
      <label className="field">
        <span className="field-label">{mode === 'dismiss' ? 'Why is this a false alarm?' : 'What was done?'}</span>
        <textarea
          className="textarea"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder={mode === 'dismiss' ? 'e.g. Product hidden behind price rail; counts are correct.' : 'e.g. Found a case in the back room and re-faced the shelf.'}
          required
        />
        <span className="field-hint">At least 10 characters.</span>
      </label>
      {error && <div className="form-error">{error}</div>}
    </Modal>
  );
};

export default Alerts;
