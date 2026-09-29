import type {
  Alert,
  AlertTrendDay,
  AuditLog,
  AuditResult,
  DashboardOverview,
  FloorPlan,
  FloorPlanPoint,
  FloorPlanWall,
  Pagination,
  Product,
  ProductMetrics,
  Shelf,
  StockMovement,
} from './types';

export const API_BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');

/** Resolve a server-relative asset path such as /uploads/x.jpg. */
export const assetUrl = (path: string | null | undefined) => (path ? `${API_BASE}${path}` : '');

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const isForm = init.body instanceof FormData;
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init.body && !isForm ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
  });

  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const details = body?.details;
    const firstDetail = Array.isArray(details) ? details[0]?.message : typeof details === 'string' ? details : null;
    throw new ApiError(res.status, firstDetail || body?.message || body?.error || `Request failed (${res.status})`, details);
  }
  return body as T;
}

const qs = (params: Record<string, string | number | boolean | undefined | null>) => {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') search.set(k, String(v));
  }
  const s = search.toString();
  return s ? `?${s}` : '';
};

const post = <T>(path: string, body?: unknown) =>
  request<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) });

export const api = {
  // Analytics
  dashboard: (days = 7) => request<{ data: DashboardOverview }>(`/api/analytics/dashboard${qs({ days })}`),
  alertTrends: (days = 14) => request<{ data: AlertTrendDay[] }>(`/api/analytics/alert-trends${qs({ days })}`),
  stockMovement: (days = 7) => request<{ data: StockMovement }>(`/api/analytics/stock-movement${qs({ days })}`),

  // Alerts
  alerts: (params: { statuses?: string; severity?: string; shelfLabel?: string; limit?: number } = {}) =>
    request<{ data: Alert[]; pagination: Pagination }>(`/api/alerts${qs(params)}`),
  acknowledgeAlert: (id: string, acknowledgedBy: string) =>
    post<{ data: Alert }>(`/api/alerts/${id}/acknowledge`, { acknowledgedBy }),
  resolveAlert: (id: string, body: { resolvedBy: string; resolution: string; dismiss?: boolean }) =>
    post<{ data: Alert }>(`/api/alerts/${id}/resolve`, body),

  // Products & stock
  products: (params: { q?: string; limit?: number } = {}) =>
    request<{ data: Product[]; pagination: Pagination }>(`/api/products${qs({ limit: 500, ...params })}`),
  productMetrics: (sku: string, days = 30) =>
    request<{ data: ProductMetrics }>(`/api/products/${encodeURIComponent(sku)}/metrics${qs({ days })}`),
  addStock: (body: { sku: string; quantity: number; shelfLabel: string }) => post('/api/stock/add', body),
  recordSale: (body: { sku: string; quantity: number }) => post('/api/stock/sale', body),

  // Shelves
  shelves: () => request<{ data: Shelf[]; pagination: Pagination }>(`/api/shelves${qs({ limit: 500 })}`),

  // Vision
  visionStatus: () => request<{ data: { enabled: boolean; provider: 'openai' | 'mock' | null } }>('/api/vision/status'),
  recentAudits: (limit = 100) => request<{ data: AuditLog[]; pagination: Pagination }>(`/api/vision/audits${qs({ limit })}`),
  performAudit: (form: FormData) => request<AuditResult>('/api/vision/audit', { method: 'POST', body: form }),

  // Floor plan
  floorPlan: () => request<{ data: FloorPlan }>('/api/floor-plan'),
  saveFloorPlan: (body: {
    walls: FloorPlanWall[];
    points: FloorPlanPoint[];
    shelves: Array<{ label: string; x: number; y: number }>;
  }) => request<{ data: FloorPlan }>('/api/floor-plan', { method: 'PUT', body: JSON.stringify(body) }),
};
