import type { AlertType } from '../api/types';

export const timeAgo = (iso: string | Date | null | undefined): string => {
  if (!iso) return 'never';
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
};

export const formatDateTime = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—';

export const formatPercent = (ratio: number | null | undefined, digits = 0) =>
  ratio === null || ratio === undefined ? '—' : `${(ratio * 100).toFixed(digits)}%`;

export const formatNumber = (n: number) => n.toLocaleString();

export const formatCurrency = (n: number) =>
  n.toLocaleString(undefined, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

const ALERT_TYPE_LABELS: Record<AlertType, string> = {
  PHANTOM_STOCK: 'Phantom stock',
  LOW_STOCK: 'Low stock',
  OVERSTOCKED: 'Overstocked',
  MISPLACED: 'Misplaced',
  CAMERA_FAILURE: 'Camera failure',
  DISCREPANCY: 'Count discrepancy',
};

export const alertTypeLabel = (type: AlertType) => ALERT_TYPE_LABELS[type] ?? type;

export const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase().replace(/_/g, ' ');

const OPERATOR_KEY = 'operatorName';

/** Name recorded on acknowledgements/resolutions; remembered per browser. */
export const getOperatorName = (): string => {
  try {
    return localStorage.getItem(OPERATOR_KEY) ?? '';
  } catch {
    return '';
  }
};

export const setOperatorName = (name: string) => {
  try {
    localStorage.setItem(OPERATOR_KEY, name);
  } catch {
    // storage unavailable (private mode); name just won't be remembered
  }
};
