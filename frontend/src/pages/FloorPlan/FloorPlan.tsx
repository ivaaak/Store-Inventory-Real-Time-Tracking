import { PointerEvent as ReactPointerEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import type { FloorPlanPoint, FloorPlanWall, Shelf } from '../../api/types';
import { useQuery } from '../../hooks/useQuery';
import { useToast } from '../../context/ToastContext';
import { timeAgo } from '../../lib/format';
import { EmptyState, ErrorState, Icon, IconName, Loading, SeverityBadge, StockMeter } from '../../components/ui';
import styles from './FloorPlan.module.css';

const W = 800;
const H = 600;
const GRID = 20;
const SHELF_W = 96;
const SHELF_H = 38;

type Tool = 'select' | 'wall' | 'camera' | 'entrance' | 'checkout' | 'place';
type Selection = { kind: 'shelf'; label: string } | { kind: 'point'; id: string } | { kind: 'wall'; id: string } | null;
type Drag = { kind: 'shelf'; label: string; dx: number; dy: number } | { kind: 'point'; id: string; dx: number; dy: number } | null;

const TOOLS: Array<{ id: Tool; label: string; icon: IconName }> = [
  { id: 'select', label: 'Select & move', icon: 'pointer' },
  { id: 'wall', label: 'Draw wall', icon: 'wall' },
  { id: 'camera', label: 'Add camera', icon: 'camera' },
  { id: 'entrance', label: 'Add entrance', icon: 'door' },
  { id: 'checkout', label: 'Add checkout', icon: 'register' },
];

const POINT_ICON: Record<FloorPlanPoint['type'], IconName> = { camera: 'camera', entrance: 'door', checkout: 'register' };
const POINT_LABEL: Record<FloorPlanPoint['type'], string> = { camera: 'Camera', entrance: 'Entrance', checkout: 'Checkout' };

const snap = (v: number) => Math.round(v / GRID) * GRID;
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const uid = () => Math.random().toString(36).slice(2, 10);

const FloorPlan = () => {
  const notify = useToast();
  const svgRef = useRef<SVGSVGElement>(null);

  const plan = useQuery(() => api.floorPlan().then((r) => r.data), []);
  const shelves = useQuery(() => api.shelves().then((r) => r.data), [], {
    liveOn: ['shelf.changed', 'alert.created', 'alert.updated', 'stock.changed', 'audit.completed'],
  });

  const [walls, setWalls] = useState<FloorPlanWall[]>([]);
  const [points, setPoints] = useState<FloorPlanPoint[]>([]);
  // Local shelf positions; server positions are the fallback.
  const [shelfPos, setShelfPos] = useState<Record<string, { x: number; y: number }>>({});
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  const [tool, setTool] = useState<Tool>('select');
  const [selection, setSelection] = useState<Selection>(null);
  const [drag, setDrag] = useState<Drag>(null);
  const [wallStart, setWallStart] = useState<{ x: number; y: number } | null>(null);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const [placing, setPlacing] = useState<string | null>(null);

  const resetFromServer = useCallback(() => {
    if (!plan.data) return;
    setWalls(plan.data.walls);
    setPoints(plan.data.points);
    setShelfPos({});
    setDirty(false);
    setSelection(null);
  }, [plan.data]);

  useEffect(resetFromServer, [resetFromServer]);

  const positioned = useMemo(
    () =>
      (shelves.data ?? [])
        .map((s) => {
          const pos = shelfPos[s.label] ?? (s.posX !== null && s.posY !== null ? { x: s.posX, y: s.posY } : null);
          return pos ? { shelf: s, ...pos } : null;
        })
        .filter(Boolean) as Array<{ shelf: Shelf; x: number; y: number }>,
    [shelves.data, shelfPos]
  );
  const unplaced = (shelves.data ?? []).filter((s) => !positioned.some((p) => p.shelf.id === s.id));

  const toSvg = (e: { clientX: number; clientY: number }) => {
    const svg = svgRef.current!;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const p = pt.matrixTransform(svg.getScreenCTM()!.inverse());
    return { x: clamp(p.x, 0, W), y: clamp(p.y, 0, H) };
  };

  const changeTool = (t: Tool) => {
    setTool(t);
    setWallStart(null);
    if (t !== 'place') setPlacing(null);
  };

  const onCanvasPointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    const { x, y } = toSvg(e);
    const sx = snap(x);
    const sy = snap(y);

    if (tool === 'select') {
      setSelection(null);
    } else if (tool === 'wall') {
      if (!wallStart) setWallStart({ x: sx, y: sy });
      else {
        if (sx !== wallStart.x || sy !== wallStart.y) {
          setWalls((ws) => [...ws, { id: `w-${uid()}`, x1: wallStart.x, y1: wallStart.y, x2: sx, y2: sy }]);
          setDirty(true);
        }
        // Chain walls: the end of one is the start of the next.
        setWallStart({ x: sx, y: sy });
      }
    } else if (tool === 'place' && placing) {
      setShelfPos((p) => ({ ...p, [placing]: { x: sx, y: sy } }));
      setSelection({ kind: 'shelf', label: placing });
      setPlacing(null);
      setTool('select');
      setDirty(true);
    } else if (tool === 'camera' || tool === 'entrance' || tool === 'checkout') {
      const count = points.filter((p) => p.type === tool).length + 1;
      const label = tool === 'camera' ? `CAM-${String(count).padStart(2, '0')}` : tool === 'checkout' ? `Till ${count}` : 'Entrance';
      const point: FloorPlanPoint = { id: `p-${uid()}`, type: tool, label, x: sx, y: sy };
      setPoints((ps) => [...ps, point]);
      setSelection({ kind: 'point', id: point.id });
      setTool('select');
      setDirty(true);
    }
  };

  const onPointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    const p = toSvg(e);
    setCursor(p);
    if (!drag) return;
    const x = snap(clamp(p.x - drag.dx, 0, W));
    const y = snap(clamp(p.y - drag.dy, 0, H));
    if (drag.kind === 'shelf') setShelfPos((s) => ({ ...s, [drag.label]: { x, y } }));
    else setPoints((ps) => ps.map((pt) => (pt.id === drag.id ? { ...pt, x, y } : pt)));
    setDirty(true);
  };

  const startDrag = (e: ReactPointerEvent, target: NonNullable<Selection>, origin: { x: number; y: number }) => {
    if (tool !== 'select') return;
    e.stopPropagation();
    setSelection(target);
    if (target.kind === 'wall') return;
    const p = toSvg(e);
    svgRef.current?.setPointerCapture(e.pointerId);
    setDrag(
      target.kind === 'shelf'
        ? { kind: 'shelf', label: target.label, dx: p.x - origin.x, dy: p.y - origin.y }
        : { kind: 'point', id: target.id, dx: p.x - origin.x, dy: p.y - origin.y }
    );
  };

  const deleteSelection = useCallback(() => {
    if (!selection || selection.kind === 'shelf') return;
    if (selection.kind === 'point') setPoints((ps) => ps.filter((p) => p.id !== selection.id));
    else setWalls((ws) => ws.filter((w) => w.id !== selection.id));
    setSelection(null);
    setDirty(true);
  }, [selection]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea, select')) return;
      if (e.key === 'Escape') {
        setWallStart(null);
        setPlacing(null);
        setTool('select');
      }
      if (e.key === 'Delete' || e.key === 'Backspace') deleteSelection();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [deleteSelection]);

  const save = async () => {
    setSaving(true);
    try {
      const data = await api.saveFloorPlan({
        walls,
        points,
        shelves: Object.entries(shelfPos).map(([label, p]) => ({ label, ...p })),
      });
      await shelves.refetch();
      setWalls(data.data.walls);
      setPoints(data.data.points);
      setShelfPos({});
      setDirty(false);
      notify({ kind: 'success', title: 'Floor plan saved' });
    } catch (err) {
      notify({ kind: 'error', title: 'Could not save floor plan', message: (err as Error).message });
    } finally {
      setSaving(false);
    }
  };

  if (plan.error || shelves.error) {
    return (
      <div className="page">
        <div className="card">
          <ErrorState error={(plan.error ?? shelves.error)!} onRetry={() => (plan.refetch(), shelves.refetch())} />
        </div>
      </div>
    );
  }

  const selectedShelf = selection?.kind === 'shelf' ? shelves.data?.find((s) => s.label === selection.label) : undefined;
  const selectedPoint = selection?.kind === 'point' ? points.find((p) => p.id === selection.id) : undefined;
  const selectedWall = selection?.kind === 'wall' ? walls.find((w) => w.id === selection.id) : undefined;

  const hint =
    tool === 'wall'
      ? wallStart
        ? 'Click to end the wall (and start the next). Esc to finish.'
        : 'Click to start a wall.'
      : tool === 'place'
        ? `Click to place ${placing}. Esc to cancel.`
        : tool !== 'select'
          ? `Click to add a ${POINT_LABEL[tool as FloorPlanPoint['type']].toLowerCase()}.`
          : 'Drag shelves and markers to move them. Delete removes the selected marker or wall.';

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Floor plan</h1>
          <div className="page-subtitle">Shelves are coloured by their most severe active alert</div>
        </div>
        <div className="toolbar">
          {dirty && <span className="badge badge-warning badge-dot">Unsaved changes</span>}
          <button className="btn" onClick={resetFromServer} disabled={!dirty || saving}>
            Discard
          </button>
          <button className="btn btn-primary" onClick={save} disabled={!dirty || saving}>
            {saving ? <span className="spinner" /> : <Icon name="save" size={15} />} Save
          </button>
        </div>
      </div>

      <div className={styles.layout}>
        <section className={`card ${styles.canvasCard}`}>
          <div className={styles.toolbar} role="toolbar" aria-label="Editor tools">
            <div className="btn-group">
              {TOOLS.map((t) => (
                <button
                  key={t.id}
                  className={`btn btn-sm ${tool === t.id ? 'active' : ''}`}
                  onClick={() => changeTool(t.id)}
                  title={t.label}
                  aria-pressed={tool === t.id}
                >
                  <Icon name={t.icon} size={15} />
                  <span className={styles.toolLabel}>{t.label}</span>
                </button>
              ))}
            </div>
            <span className={styles.hint}>{hint}</span>
          </div>

          {plan.loading || shelves.loading ? (
            <Loading />
          ) : (
            <div className={styles.canvasWrap}>
              <svg
                ref={svgRef}
                viewBox={`0 0 ${W} ${H}`}
                className={`${styles.canvas} ${tool !== 'select' ? styles.crosshair : ''}`}
                onPointerDown={onCanvasPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={() => setDrag(null)}
                onPointerLeave={() => setCursor(null)}
                role="application"
                aria-label="Store floor plan editor"
              >
                <defs>
                  <pattern id="grid" width={GRID} height={GRID} patternUnits="userSpaceOnUse">
                    <path d={`M ${GRID} 0 L 0 0 0 ${GRID}`} className={styles.gridLine} />
                  </pattern>
                </defs>
                <rect width={W} height={H} fill="url(#grid)" />

                {walls.map((w) => (
                  <g key={w.id} onPointerDown={(e) => startDrag(e, { kind: 'wall', id: w.id }, { x: 0, y: 0 })}>
                    <line x1={w.x1} y1={w.y1} x2={w.x2} y2={w.y2} className={styles.wallHit} />
                    <line x1={w.x1} y1={w.y1} x2={w.x2} y2={w.y2} className={`${styles.wall} ${selectedWall?.id === w.id ? styles.selectedStroke : ''}`} />
                  </g>
                ))}

                {wallStart && cursor && (
                  <line x1={wallStart.x} y1={wallStart.y} x2={snap(cursor.x)} y2={snap(cursor.y)} className={styles.wallPreview} />
                )}

                {positioned.map(({ shelf, x, y }) => {
                  const selected = selectedShelf?.id === shelf.id;
                  return (
                    <g
                      key={shelf.id}
                      transform={`translate(${x - SHELF_W / 2} ${y - SHELF_H / 2})`}
                      className={`${styles.shelf} ${shelf.worstSeverity ? `sev-${shelf.worstSeverity}` : ''}`}
                      onPointerDown={(e) => startDrag(e, { kind: 'shelf', label: shelf.label }, { x, y })}
                    >
                      <title>
                        {shelf.label}
                        {shelf.openAlerts ? ` — ${shelf.openAlerts} active alert(s)` : ''}
                      </title>
                      <rect
                        width={SHELF_W}
                        height={SHELF_H}
                        rx={6}
                        className={`${styles.shelfBody} ${shelf.worstSeverity ? styles.shelfAlert : ''} ${shelf.auditDue ? styles.shelfDue : ''} ${selected ? styles.selectedStroke : ''}`}
                      />
                      <text x={SHELF_W / 2} y={SHELF_H / 2 - 3} className={styles.shelfLabel}>
                        {shelf.label}
                      </text>
                      <text x={SHELF_W / 2} y={SHELF_H / 2 + 11} className={styles.shelfSub}>
                        {shelf.openAlerts ? `${shelf.openAlerts} alert${shelf.openAlerts === 1 ? '' : 's'}` : `${shelf.products.length} products`}
                      </text>
                    </g>
                  );
                })}

                {points.map((p) => (
                  <g
                    key={p.id}
                    transform={`translate(${p.x} ${p.y})`}
                    className={styles.point}
                    onPointerDown={(e) => startDrag(e, { kind: 'point', id: p.id }, { x: p.x, y: p.y })}
                  >
                    <title>{p.label}</title>
                    <circle r={15} className={`${styles.pointBody} ${styles[`point-${p.type}`]} ${selectedPoint?.id === p.id ? styles.selectedStroke : ''}`} />
                    <g transform="translate(-8 -8)" className={styles.pointIcon}>
                      <Icon name={POINT_ICON[p.type]} size={16} />
                    </g>
                    <text y={29} className={styles.pointLabel}>
                      {p.label}
                    </text>
                  </g>
                ))}

                {tool === 'place' && placing && cursor && (
                  <rect
                    x={snap(cursor.x) - SHELF_W / 2}
                    y={snap(cursor.y) - SHELF_H / 2}
                    width={SHELF_W}
                    height={SHELF_H}
                    rx={6}
                    className={styles.ghost}
                  />
                )}
              </svg>
            </div>
          )}

          <div className={styles.legend} aria-label="Legend">
            <span>
              <i className={styles.legendShelf} /> Shelf, no alerts
            </span>
            <span>
              <i className={`${styles.legendShelf} ${styles.legendAlert}`} /> Active alert (darker = more severe)
            </span>
            <span>
              <i className={`${styles.legendShelf} ${styles.legendDue}`} /> Audit due
            </span>
          </div>
        </section>

        <aside className={styles.side}>
          <section className="card">
            <div className="card-header">
              <h2 className="card-title">Properties</h2>
            </div>
            <div className="card-body">
              {selectedShelf ? (
                <ShelfProperties shelf={selectedShelf} />
              ) : selectedPoint ? (
                <div className={styles.props}>
                  <div className="field">
                    <span className="field-label">Type</span>
                    <span>{POINT_LABEL[selectedPoint.type]}</span>
                  </div>
                  <label className="field">
                    <span className="field-label">Label</span>
                    <input
                      className="input"
                      value={selectedPoint.label}
                      onChange={(e) => {
                        setPoints((ps) => ps.map((p) => (p.id === selectedPoint.id ? { ...p, label: e.target.value } : p)));
                        setDirty(true);
                      }}
                    />
                  </label>
                  {selectedPoint.type === 'camera' && (
                    <label className="field">
                      <span className="field-label">Stream URL</span>
                      <input
                        className="input mono"
                        value={selectedPoint.cameraUrl ?? ''}
                        placeholder="rtsp://…"
                        onChange={(e) => {
                          setPoints((ps) => ps.map((p) => (p.id === selectedPoint.id ? { ...p, cameraUrl: e.target.value || undefined } : p)));
                          setDirty(true);
                        }}
                      />
                    </label>
                  )}
                  <button className="btn btn-danger" onClick={deleteSelection}>
                    <Icon name="trash" size={15} /> Remove marker
                  </button>
                </div>
              ) : selectedWall ? (
                <div className={styles.props}>
                  <span className="muted num">
                    Wall ({selectedWall.x1}, {selectedWall.y1}) → ({selectedWall.x2}, {selectedWall.y2})
                  </span>
                  <button className="btn btn-danger" onClick={deleteSelection}>
                    <Icon name="trash" size={15} /> Remove wall
                  </button>
                </div>
              ) : (
                <EmptyState icon="pointer" title="Nothing selected">
                  Click a shelf, marker or wall.
                </EmptyState>
              )}
            </div>
          </section>

          <section className="card">
            <div className="card-header">
              <h2 className="card-title">Unplaced shelves</h2>
              <span className="muted num">{unplaced.length}</span>
            </div>
            {unplaced.length === 0 ? (
              <div className="card-body muted">Every shelf is on the plan.</div>
            ) : (
              <ul className={styles.unplaced}>
                {unplaced.map((s) => (
                  <li key={s.id}>
                    <button
                      className={`list-item ${placing === s.label ? 'selected' : ''}`}
                      onClick={() => {
                        setPlacing(s.label);
                        setTool('place');
                        setWallStart(null);
                      }}
                    >
                      <span className="mono">{s.label}</span> <span className="muted">{s.zone}</span>
                      <span className={styles.placeHint}>Place →</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
};

const ShelfProperties = ({ shelf }: { shelf: Shelf }) => (
  <div className={styles.props}>
    <div className={styles.shelfHead}>
      <div>
        <div className="mono" style={{ fontWeight: 600 }}>
          {shelf.label}
        </div>
        <div className="muted">
          {shelf.zone ?? 'No zone'} · scanned {timeAgo(shelf.lastScanned)}
        </div>
      </div>
      {shelf.worstSeverity && <SeverityBadge severity={shelf.worstSeverity} />}
    </div>
    {shelf.products.length === 0 ? (
      <span className="muted">No products assigned.</span>
    ) : (
      <ul className={styles.productList}>
        {shelf.products.map((p) => {
          const status = p.stock === 0 ? 'OUT' : p.stock <= p.minThreshold ? 'LOW' : p.stock > p.maxCapacity ? 'OVER' : 'OK';
          return (
            <li key={p.id}>
              <Link to={`/inventory?sku=${encodeURIComponent(p.sku)}`} className={styles.productRow}>
                <span>{p.name}</span>
                <span className="num muted">
                  {p.stock}/{p.maxCapacity}
                </span>
              </Link>
              <StockMeter stock={p.stock} max={p.maxCapacity} status={status} />
            </li>
          );
        })}
      </ul>
    )}
    <div className={styles.propActions}>
      <Link className="btn btn-sm" to={`/vision-ai?shelf=${encodeURIComponent(shelf.label)}`}>
        <Icon name="scan" size={14} /> Audit shelf
      </Link>
      {shelf.openAlerts > 0 && (
        <Link className="btn btn-sm" to="/alerts">
          <Icon name="bell" size={14} /> {shelf.openAlerts} alert{shelf.openAlerts === 1 ? '' : 's'}
        </Link>
      )}
    </div>
  </div>
);

export default FloorPlan;
