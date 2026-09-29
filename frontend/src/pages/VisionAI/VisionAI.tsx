import { DragEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, ApiError, assetUrl } from '../../api/client';
import type { AuditLog } from '../../api/types';
import { useQuery } from '../../hooks/useQuery';
import { useToast } from '../../context/ToastContext';
import { alertTypeLabel, formatDateTime, formatPercent, timeAgo } from '../../lib/format';
import { EmptyState, ErrorState, Icon, Loading } from '../../components/ui';
import styles from './VisionAI.module.css';

/** One audit run = one image of one shelf, covering several products. */
interface AuditRun {
  key: string;
  shelfLabel: string;
  createdAt: string;
  imageUrl: string | null;
  failed: boolean;
  items: AuditLog[];
  alerts: number;
  avgConfidence: number;
  rawOutput: string | null;
}

const groupRuns = (logs: AuditLog[]): AuditRun[] => {
  const runs = new Map<string, AuditRun>();
  for (const log of logs) {
    const shelfLabel = log.shelf?.label ?? '?';
    // Uploaded audits share an image; seeded/legacy rows fall back to the minute.
    const key = `${shelfLabel}|${log.imageUrl ?? log.createdAt.slice(0, 16)}`;
    let run = runs.get(key);
    if (!run) {
      run = { key, shelfLabel, createdAt: log.createdAt, imageUrl: log.imageUrl, failed: false, items: [], alerts: 0, avgConfidence: 0, rawOutput: log.rawAiOutput };
      runs.set(key, run);
    }
    run.items.push(log);
    if (log.status === 'FAILED') run.failed = true;
    if (log.alertType) run.alerts++;
  }
  for (const run of runs.values()) {
    run.avgConfidence = run.items.reduce((s, i) => s + i.confidence, 0) / run.items.length;
  }
  return [...runs.values()];
};

const runKeyForResult = (shelfLabel: string, imageUrl: string) => `${shelfLabel}|${imageUrl}`;

const VisionAI = () => {
  const [params] = useSearchParams();
  const notify = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [shelfLabel, setShelfLabel] = useState(params.get('shelf') ?? '');
  const [force, setForce] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const status = useQuery(() => api.visionStatus().then((r) => r.data), []);
  const shelves = useQuery(() => api.shelves().then((r) => r.data), [], { liveOn: ['shelf.changed', 'audit.completed'] });
  const audits = useQuery(() => api.recentAudits(200).then((r) => r.data), [], { liveOn: ['audit.completed'] });

  const runs = useMemo(() => groupRuns(audits.data ?? []), [audits.data]);
  const selectedRun = runs.find((r) => r.key === selectedKey) ?? null;
  const shelf = shelves.data?.find((s) => s.label === shelfLabel);

  // Object URLs must be released or they leak for the life of the tab.
  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const pickFile = (f: File | undefined) => {
    if (!f) return;
    if (!f.type.startsWith('image/')) {
      setError('Please choose an image file (JPG, PNG or WebP).');
      return;
    }
    if (f.size > 10 * 1024 * 1024) {
      setError('Image is larger than 10 MB.');
      return;
    }
    setError(null);
    setFile(f);
    setPreviewUrl(URL.createObjectURL(f));
  };

  const clearFile = () => {
    setFile(null);
    setPreviewUrl('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    pickFile(e.dataTransfer.files[0]);
  };

  const analyze = async () => {
    if (!file || !shelfLabel) return;
    setAnalyzing(true);
    setError(null);
    const form = new FormData();
    form.append('image', file);
    form.append('shelfLabel', shelfLabel);
    form.append('force', String(force));
    try {
      const result = await api.performAudit(form);
      notify({
        kind: result.metadata.alertsRaised ? 'alert' : 'success',
        title: `Audit of ${result.shelfLabel} complete`,
        message: result.metadata.alertsRaised ? `${result.metadata.alertsRaised} issue(s) flagged` : 'Shelf matches the book',
      });
      clearFile();
      setForce(false);
      await audits.refetch();
      setSelectedKey(runKeyForResult(result.shelfLabel, result.imageUrl));
    } catch (err) {
      setError(err instanceof ApiError && err.status === 429 ? `${err.message} Tick “Audit anyway” to override.` : (err as Error).message);
    } finally {
      setAnalyzing(false);
    }
  };

  const disabled = status.data && !status.data.enabled;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Vision AI audits</h1>
          <div className="page-subtitle">Compare what the camera sees with what the book says</div>
        </div>
        {status.data?.provider && (
          <span className={`badge ${status.data.provider === 'mock' ? 'badge-warning' : 'badge-success'} badge-dot`}>
            {status.data.provider === 'mock' ? 'Mock provider (development)' : 'OpenAI vision'}
          </span>
        )}
      </div>

      {disabled && (
        <div className={`card ${styles.banner}`} role="status">
          <Icon name="alert" />
          <div>
            <strong>Vision AI is not configured.</strong> Set <code>OPENAI_API_KEY</code> on the API server, or{' '}
            <code>VISION_PROVIDER=mock</code> for local development. Audit history is still available below.
          </div>
        </div>
      )}

      <div className="split">
        <div className={styles.mainCol}>
          <section className="card" aria-label="New audit">
            <div className="card-header">
              <h2 className="card-title">New audit</h2>
            </div>
            <div className={`card-body ${styles.form}`}>
              <div className={styles.formRow}>
                <label className="field">
                  <span className="field-label">Shelf</span>
                  <select className="select" value={shelfLabel} onChange={(e) => setShelfLabel(e.target.value)}>
                    <option value="">Choose a shelf…</option>
                    {shelves.data?.map((s) => (
                      <option key={s.id} value={s.label}>
                        {s.label}
                        {s.zone ? ` — ${s.zone}` : ''}
                        {s.auditDue ? ' (due)' : ''}
                      </option>
                    ))}
                  </select>
                  {shelf && (
                    <span className="field-hint">
                      {shelf.products.length} product{shelf.products.length === 1 ? '' : 's'} expected · last scanned {timeAgo(shelf.lastScanned)}
                    </span>
                  )}
                </label>

                <div
                  className={`${styles.dropzone} ${dragging ? styles.dropzoneActive : ''} ${previewUrl ? styles.dropzoneFilled : ''}`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragging(true);
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={onDrop}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="sr-only"
                    id="shelf-image"
                    onChange={(e) => pickFile(e.target.files?.[0])}
                  />
                  {previewUrl ? (
                    <>
                      <img src={previewUrl} alt="Selected shelf" className={styles.preview} />
                      <button type="button" className={`btn btn-sm ${styles.removeBtn}`} onClick={clearFile}>
                        <Icon name="x" size={14} /> Remove
                      </button>
                    </>
                  ) : (
                    <label htmlFor="shelf-image" className={styles.dropzoneLabel}>
                      <Icon name="upload" size={22} />
                      <span>
                        <strong>Drop a shelf photo</strong> or click to browse
                      </span>
                      <span className="muted">JPG, PNG or WebP · max 10 MB</span>
                    </label>
                  )}
                </div>
              </div>

              {shelf && shelf.products.length > 0 && (
                <div className={styles.expected}>
                  {shelf.products.map((p) => (
                    <span key={p.id} className="badge">
                      {p.name} <span className="num muted">· {p.stock}</span>
                    </span>
                  ))}
                </div>
              )}

              {error && <div className="form-error">{error}</div>}

              <div className={styles.submitRow}>
                <label className="checkbox">
                  <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} />
                  Audit anyway if scanned recently
                </label>
                <button className="btn btn-primary" onClick={analyze} disabled={!file || !shelfLabel || analyzing || !!disabled}>
                  {analyzing ? (
                    <>
                      <span className="spinner" /> Analyzing…
                    </>
                  ) : (
                    <>
                      <Icon name="scan" size={15} /> Analyze shelf
                    </>
                  )}
                </button>
              </div>
            </div>
          </section>

          <section className="card" aria-label="Audit history">
            <div className="card-header">
              <h2 className="card-title">Audit history</h2>
              <span className="muted">{runs.length} runs</span>
            </div>
            {audits.loading ? (
              <Loading />
            ) : audits.error ? (
              <ErrorState error={audits.error} onRetry={audits.refetch} />
            ) : runs.length === 0 ? (
              <EmptyState icon="eye" title="No audits yet">
                Upload a shelf photo to run the first one.
              </EmptyState>
            ) : (
              <ul className={styles.runs}>
                {runs.map((run) => (
                  <li key={run.key}>
                    <button className={`list-item ${styles.run} ${selectedKey === run.key ? 'selected' : ''}`} onClick={() => setSelectedKey(run.key)}>
                      <div className={styles.thumb}>
                        {run.imageUrl ? <img src={assetUrl(run.imageUrl)} alt="" loading="lazy" /> : <Icon name="image" size={18} />}
                      </div>
                      <div className={styles.runMain}>
                        <div className={styles.runTitle}>
                          <span className="mono">{run.shelfLabel}</span>
                          {run.failed ? (
                            <span className="badge badge-danger">Failed</span>
                          ) : run.alerts ? (
                            <span className="badge badge-warning">
                              {run.alerts} issue{run.alerts === 1 ? '' : 's'}
                            </span>
                          ) : (
                            <span className="badge badge-success">Matches book</span>
                          )}
                        </div>
                        <div className={styles.runMeta}>
                          {run.items.length} product{run.items.length === 1 ? '' : 's'} · confidence {formatPercent(run.avgConfidence)}
                        </div>
                      </div>
                      <span className={styles.runTime}>{timeAgo(run.createdAt)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <aside className="card detail" aria-label="Audit details">
          {selectedRun ? (
            <RunDetail run={selectedRun} />
          ) : (
            <EmptyState icon="eye" title="No audit selected">
              Pick an audit run to compare visual and system counts.
            </EmptyState>
          )}
        </aside>
      </div>
    </div>
  );
};

const RunDetail = ({ run }: { run: AuditRun }) => (
  <>
    <div className="card-header">
      <div>
        <h2 className="card-title">
          Audit · <span className="mono">{run.shelfLabel}</span>
        </h2>
        <div className="muted">{formatDateTime(run.createdAt)}</div>
      </div>
    </div>
    {run.imageUrl && (
      <a href={assetUrl(run.imageUrl)} target="_blank" rel="noreferrer" className={styles.detailImage}>
        <img src={assetUrl(run.imageUrl)} alt={`Shelf ${run.shelfLabel}`} />
      </a>
    )}
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Product</th>
            <th className="right">System</th>
            <th className="right">Visual</th>
            <th className="right">Conf.</th>
          </tr>
        </thead>
        <tbody>
          {run.items.map((i) => (
            <tr key={i.id}>
              <td>
                <div>{i.product.name}</div>
                {i.alertType && <span className="badge badge-warning">{alertTypeLabel(i.alertType)}</span>}
              </td>
              <td className="right num">{i.systemCount}</td>
              <td className={`right num ${i.discrepancy !== 0 && i.status !== 'FAILED' ? styles.mismatch : ''}`}>
                {i.status === 'FAILED' ? '—' : i.visualCount}
              </td>
              <td className="right num">{formatPercent(i.confidence)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    {run.rawOutput && (
      <details className={styles.raw}>
        <summary>Raw model output</summary>
        <pre>{run.rawOutput}</pre>
      </details>
    )}
  </>
);

export default VisionAI;
