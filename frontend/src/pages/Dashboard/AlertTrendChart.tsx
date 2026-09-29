import { useLayoutEffect, useRef, useState } from 'react';
import type { AlertTrendDay } from '../../api/types';
import styles from './Dashboard.module.css';

// Stacked bottom-up, most severe at the base so it's always visible.
const SERIES = [
  { key: 'critical', label: 'Critical', color: 'var(--sev-critical)' },
  { key: 'high', label: 'High', color: 'var(--sev-high)' },
  { key: 'medium', label: 'Medium', color: 'var(--sev-medium)' },
  { key: 'low', label: 'Low', color: 'var(--sev-low)' },
] as const;

const HEIGHT = 200;
const PAD = { top: 12, right: 8, bottom: 24, left: 28 };
const GAP = 2; // surface gap between stacked segments

const shortDate = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

const niceMax = (n: number) => (n <= 4 ? 4 : Math.ceil(n / 4) * 4);

export const AlertTrendChart = ({ data }: { data: AlertTrendDay[] }) => {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  const [hover, setHover] = useState<number | null>(null);

  // Measure before paint so the SVG never renders wider than its container.
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    setWidth(Math.max(280, el.clientWidth));
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(280, entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const max = niceMax(Math.max(0, ...data.map((d) => d.total)));
  const plotW = width - PAD.left - PAD.right;
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const band = plotW / Math.max(1, data.length);
  const barW = Math.max(4, Math.min(28, band * 0.6));
  const y = (v: number) => PAD.top + plotH - (v / max) * plotH;
  const ticks = [0, max / 4, max / 2, (3 * max) / 4, max];
  const labelEvery = Math.ceil(data.length / Math.max(2, Math.floor(plotW / 56)));
  const hovered = hover !== null ? data[hover] : null;

  return (
    <div className={styles.chart}>
      <div className={styles.legend} aria-hidden="true">
        {SERIES.map((s) => (
          <span key={s.key} className={styles.legendItem}>
            <span className={styles.legendSwatch} style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
      </div>

      <div ref={wrapRef} className={styles.chartArea} onMouseLeave={() => setHover(null)}>
        <svg width={width} height={HEIGHT} role="img" aria-label="Alerts raised per day by severity">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} className={styles.gridLine} />
              <text x={PAD.left - 8} y={y(t)} className={styles.axisLabel} textAnchor="end" dominantBaseline="middle">
                {t}
              </text>
            </g>
          ))}

          {data.map((d, i) => {
            const cx = PAD.left + band * i + band / 2;
            const x = cx - barW / 2;
            let acc = 0;
            const segments = SERIES.map((s) => {
              const v = d[s.key];
              const seg = { key: s.key, color: s.color, y0: acc, y1: acc + v };
              acc += v;
              return seg;
            }).filter((s) => s.y1 > s.y0);
            const top = y(d.total);
            const clipId = `col-${i}`;

            return (
              <g key={d.date}>
                {d.total > 0 && (
                  <>
                    <clipPath id={clipId}>
                      {/* rounded data-end, square baseline */}
                      <path
                        d={`M${x},${y(0)} V${top + 4} Q${x},${top} ${x + 4},${top} H${x + barW - 4} Q${x + barW},${top} ${x + barW},${top + 4} V${y(0)} Z`}
                      />
                    </clipPath>
                    <g clipPath={`url(#${clipId})`} opacity={hover === null || hover === i ? 1 : 0.45}>
                      {segments.map((s, si) => {
                        const yTop = y(s.y1);
                        const yBottom = y(s.y0) - (si > 0 ? GAP : 0);
                        return <rect key={s.key} x={x} width={barW} y={yTop} height={Math.max(0, yBottom - yTop)} fill={s.color} />;
                      })}
                    </g>
                  </>
                )}
                {i % labelEvery === 0 && (
                  <text x={cx} y={HEIGHT - 6} className={styles.axisLabel} textAnchor="middle">
                    {shortDate(d.date)}
                  </text>
                )}
                {/* hit target spans the whole band, larger than the mark */}
                <rect
                  x={PAD.left + band * i}
                  y={PAD.top}
                  width={band}
                  height={plotH}
                  fill="transparent"
                  onMouseEnter={() => setHover(i)}
                />
              </g>
            );
          })}
          <line x1={PAD.left} x2={width - PAD.right} y1={y(0)} y2={y(0)} className={styles.baseline} />
        </svg>

        {hovered && hover !== null && (
          <div
            className={styles.tooltip}
            style={{
              left: Math.min(width - 150, Math.max(0, PAD.left + band * hover + band / 2 - 70)),
              top: Math.max(0, y(hovered.total) - 110),
            }}
          >
            <div className={styles.tooltipTitle}>
              {shortDate(hovered.date)} · {hovered.total} alert{hovered.total === 1 ? '' : 's'}
            </div>
            {SERIES.map((s) => (
              <div key={s.key} className={styles.tooltipRow}>
                <span className={styles.legendSwatch} style={{ background: s.color }} />
                <span>{s.label}</span>
                <span className="num">{hovered[s.key]}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <table className="sr-only">
        <caption>Alerts per day by severity</caption>
        <thead>
          <tr>
            <th>Date</th>
            {SERIES.map((s) => (
              <th key={s.key}>{s.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.date}>
              <td>{d.date}</td>
              {SERIES.map((s) => (
                <td key={s.key}>{d[s.key]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
