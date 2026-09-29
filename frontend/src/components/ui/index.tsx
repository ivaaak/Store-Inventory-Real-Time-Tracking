import { FormEvent, ReactNode, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import type { AlertSeverity, AlertStatus, StockStatus } from '../../api/types';
import { titleCase } from '../../lib/format';
import { Icon, IconName } from './Icon';
import styles from './ui.module.css';

export { Icon } from './Icon';
export type { IconName } from './Icon';

/* ---------- Badges ---------- */

export const SeverityBadge = ({ severity }: { severity: AlertSeverity }) => (
  <span className={`badge badge-sev sev-${severity}`}>{titleCase(severity)}</span>
);

const STATUS_TONE: Record<AlertStatus, string> = {
  OPEN: 'badge-danger',
  ACKNOWLEDGED: 'badge-warning',
  IN_PROGRESS: 'badge-info',
  RESOLVED: 'badge-success',
  DISMISSED: '',
};

export const AlertStatusBadge = ({ status }: { status: AlertStatus }) => (
  <span className={`badge badge-dot ${STATUS_TONE[status]}`}>{titleCase(status)}</span>
);

const STOCK_BADGE: Record<StockStatus, [string, string]> = {
  OUT: ['badge-danger', 'Out of stock'],
  LOW: ['badge-warning', 'Low stock'],
  OK: ['badge-success', 'In stock'],
  OVER: ['badge-info', 'Overstocked'],
};

export const StockBadge = ({ status }: { status: StockStatus }) => {
  const [tone, label] = STOCK_BADGE[status];
  return <span className={`badge badge-dot ${tone}`}>{label}</span>;
};

export const stockColor = (status: StockStatus) =>
  status === 'OUT' ? 'var(--color-danger)' : status === 'LOW' ? 'var(--color-warning)' : status === 'OVER' ? 'var(--color-info)' : 'var(--color-success)';

export const StockMeter = ({ stock, max, status }: { stock: number; max: number; status: StockStatus }) => (
  <div
    className="meter"
    role="meter"
    aria-valuenow={stock}
    aria-valuemin={0}
    aria-valuemax={max}
    aria-label={`${stock} of ${max}`}
  >
    <span style={{ width: `${Math.min(100, max > 0 ? (stock / max) * 100 : 0)}%`, ['--meter-color' as string]: stockColor(status) }} />
  </div>
);

/* ---------- Stat card ---------- */

interface StatCardProps {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: IconName;
  tone?: 'danger' | 'warning' | 'success';
  to?: string;
}

export const StatCard = ({ label, value, hint, icon, tone, to }: StatCardProps) => {
  const toneClass = tone ? styles[`tone${tone[0].toUpperCase()}${tone.slice(1)}`] : '';
  const content = (
    <>
      <div className={styles.statLabel}>
        {icon && <Icon name={icon} size={15} />}
        {label}
      </div>
      <div className={styles.statValue}>{value}</div>
      {hint && <div className={styles.statHint}>{hint}</div>}
    </>
  );
  return to ? (
    <Link to={to} className={`card ${styles.stat} ${styles.statLink} ${toneClass}`}>
      {content}
    </Link>
  ) : (
    <div className={`card ${styles.stat} ${toneClass}`}>{content}</div>
  );
};

/* ---------- Loading / empty / error ---------- */

export const Loading = ({ label = 'Loading…' }: { label?: string }) => (
  <div className={styles.state} role="status">
    <span className="spinner" />
    <span>{label}</span>
  </div>
);

export const EmptyState = ({ icon = 'package', title, children }: { icon?: IconName; title: string; children?: ReactNode }) => (
  <div className={styles.state}>
    <div className={styles.stateIcon}>
      <Icon name={icon} size={20} />
    </div>
    <div className={styles.stateTitle}>{title}</div>
    {children && <div>{children}</div>}
  </div>
);

export const ErrorState = ({ error, onRetry }: { error: Error; onRetry?: () => void }) => (
  <div className={`${styles.state} ${styles.stateError}`} role="alert">
    <div className={styles.stateIcon}>
      <Icon name="alert" size={20} />
    </div>
    <div className={styles.stateTitle}>Couldn’t load data</div>
    <div>{error.message}</div>
    {onRetry && (
      <button className="btn btn-sm" onClick={onRetry}>
        <Icon name="refresh" size={14} /> Retry
      </button>
    )}
  </div>
);

/* ---------- Modal ---------- */

interface ModalProps {
  title: string;
  onClose: () => void;
  onSubmit?: (e: FormEvent) => void;
  children: ReactNode;
  footer: ReactNode;
}

export const Modal = ({ title, onClose, onSubmit, children, footer }: ModalProps) => {
  const dialogRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    // Focus the first form field (not the header's close button).
    const firstField =
      dialogRef.current?.querySelector<HTMLElement>('input, textarea, select') ??
      dialogRef.current?.querySelector<HTMLElement>('button[type="submit"]');
    firstField?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previous?.focus();
    };
  }, [onClose]);

  return (
    <div className={styles.backdrop} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form
        ref={dialogRef}
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit?.(e);
        }}
      >
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>{title}</h2>
          <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={onClose} aria-label="Close">
            <Icon name="x" size={16} />
          </button>
        </div>
        <div className={styles.modalBody}>{children}</div>
        <div className={styles.modalFooter}>{footer}</div>
      </form>
    </div>
  );
};
