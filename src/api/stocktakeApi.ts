import {
  PlacementApiError,
  PlacementTimeoutError,
  requestJson,
  type ApiErrorBody,
  type RackReference,
} from './placementApi';

export type StocktakeStatus = 'draft' | 'submitted' | 'cancelled' | string;

export type StocktakeSession = {
  id: string;
  session_number: string;
  session_date: string;
  status: StocktakeStatus;
  notes?: string | null;
  submitted_at?: string | null;
  created_at?: string | null;
  summary?: StocktakeSummary | null;
  [key: string]: unknown;
};

export type StocktakeSummary = {
  expected_count: number;
  scanned_count: number;
  missing_count: number;
  changed_count: number;
  rejected_count: number;
  total_units_expected?: number;
  total_units_scanned?: number;
  [key: string]: unknown;
};

export type StocktakeItem = {
  id?: string;
  rfid_number: string;
  pack_plan_id?: string;
  pack_number?: number;
  label_code?: string | null;
  sku?: string | null;
  product_name?: string | null;
  base_unit?: string | null;
  units?: number | null;
  expires_on?: string | null;
  expected_rack?: RackReference | null;
  observed_rack?: RackReference | null;
  scan_count?: number;
  result: 'pending' | 'matched' | 'missing' | 'lifecycle_changed' | string;
  [key: string]: unknown;
};

export type StocktakeRack = {
  rack?: RackReference | null;
  expected_count: number;
  scanned_count: number;
  missing_count: number;
  changed_count: number;
  items: StocktakeItem[];
  [key: string]: unknown;
};

export type RejectedStocktakeScan = {
  rfid_number: string;
  accepted?: false;
  error_code?: string;
  code?: string;
  message?: string;
  result?: {
    code?: string;
    error_code?: string;
    message?: string;
    [key: string]: unknown;
  } | string | null;
  [key: string]: unknown;
};

export type StocktakeReport = {
  session: StocktakeSession;
  summary: StocktakeSummary;
  racks: StocktakeRack[];
  rejected_scans: RejectedStocktakeScan[];
};

export type StocktakeScanResult = {
  rfid_number: string;
  accepted: boolean;
  result?: string;
  error_code?: string;
  code?: string;
  message?: string;
  [key: string]: unknown;
};

export type StocktakeScanResponse = {
  report: StocktakeReport;
  results: StocktakeScanResult[];
  reused: boolean;
};

export type PendingStocktakeScan = {
  stocktakeSessionId: string;
  clientRequestId: string;
  rfidNumbers: string[];
  createdAt: string;
};

function asNumber(value: unknown, fallback = 0): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeSession(value: unknown): StocktakeSession {
  const raw = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  return {
    ...raw,
    id: String(raw.id ?? raw.stocktake_session_id ?? ''),
    session_number: String(raw.session_number ?? raw.number ?? '-'),
    session_date: String(raw.session_date ?? raw.created_at ?? ''),
    status: String(raw.status ?? 'draft') as StocktakeStatus,
    notes: typeof raw.notes === 'string' ? raw.notes : raw.notes == null ? null : String(raw.notes),
    submitted_at: raw.submitted_at == null ? null : String(raw.submitted_at),
    created_at: raw.created_at == null ? null : String(raw.created_at),
    summary: raw.summary ? normalizeSummary(raw.summary) : null,
  };
}

function normalizeSummary(value: unknown): StocktakeSummary {
  const raw = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  return {
    ...raw,
    expected_count: asNumber(raw.expected_count),
    scanned_count: asNumber(raw.scanned_count),
    missing_count: asNumber(raw.missing_count),
    changed_count: asNumber(raw.changed_count),
    rejected_count: asNumber(raw.rejected_count),
    total_units_expected: raw.total_units_expected == null ? undefined : asNumber(raw.total_units_expected),
    total_units_scanned: raw.total_units_scanned == null ? undefined : asNumber(raw.total_units_scanned),
  };
}

function normalizeRack(value: unknown): RackReference | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  if (raw.id == null && raw.code == null && raw.name == null) return null;
  return {
    id: String(raw.id ?? ''),
    code: String(raw.code ?? '-'),
    name: String(raw.name ?? '-'),
  };
}

function normalizeItem(value: unknown): StocktakeItem {
  const raw = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  return {
    ...raw,
    rfid_number: String(raw.rfid_number ?? ''),
    pack_plan_id: raw.pack_plan_id == null ? undefined : String(raw.pack_plan_id),
    pack_number: raw.pack_number == null ? undefined : asNumber(raw.pack_number),
    label_code: raw.label_code == null ? null : String(raw.label_code),
    sku: raw.sku == null ? null : String(raw.sku),
    product_name: raw.product_name == null ? null : String(raw.product_name),
    base_unit: raw.base_unit == null ? null : String(raw.base_unit),
    units: raw.units == null ? null : asNumber(raw.units),
    expires_on: raw.expires_on == null ? null : String(raw.expires_on),
    expected_rack: normalizeRack(raw.expected_rack),
    observed_rack: normalizeRack(raw.observed_rack),
    scan_count: raw.scan_count == null ? undefined : asNumber(raw.scan_count),
    result: String(raw.result ?? 'pending'),
  };
}

function normalizeReport(value: unknown): StocktakeReport {
  const raw = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const rawRacks = Array.isArray(raw.racks) ? raw.racks : [];
  return {
    session: normalizeSession(raw.session ?? (raw.id || raw.stocktake_session_id ? raw : undefined)),
    summary: normalizeSummary(raw.summary),
    racks: rawRacks.map(row => {
      const rack = (row && typeof row === 'object' ? row : {}) as Record<string, unknown>;
      return {
        ...rack,
        rack: normalizeRack(rack.rack),
        expected_count: asNumber(rack.expected_count),
        scanned_count: asNumber(rack.scanned_count),
        missing_count: asNumber(rack.missing_count),
        changed_count: asNumber(rack.changed_count),
        items: Array.isArray(rack.items) ? rack.items.map(normalizeItem) : [],
      };
    }),
    rejected_scans: Array.isArray(raw.rejected_scans)
      ? raw.rejected_scans.map(rejectedValue => {
          const rejected = (rejectedValue && typeof rejectedValue === 'object' ? rejectedValue : {}) as Record<string, unknown>;
          const result = rejected.result && typeof rejected.result === 'object'
            ? rejected.result as Record<string, unknown>
            : {};
          return {
            ...rejected,
            rfid_number: String(rejected.rfid_number ?? ''),
            error_code: rejected.error_code == null && result.error_code == null
              ? undefined
              : String(rejected.error_code ?? result.error_code),
            code: rejected.code == null && result.code == null
              ? undefined
              : String(rejected.code ?? result.code),
            message: rejected.message == null && result.message == null
              ? undefined
              : String(rejected.message ?? result.message),
          };
        })
      : [],
  };
}

function bodyData(body: unknown): Record<string, unknown> {
  const raw = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  return raw.data && typeof raw.data === 'object' ? raw.data as Record<string, unknown> : raw;
}

function reportFromBody(body: unknown): StocktakeReport {
  const raw = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const data = raw.data && typeof raw.data === 'object'
    ? raw.data as Record<string, unknown>
    : undefined;
  const report = raw.report ?? data?.report ?? data;
  return normalizeReport(report);
}

export function stocktakeReportFromValue(value: unknown): StocktakeReport {
  return normalizeReport(value);
}

export function stocktakeReportFromResponse(value: unknown): StocktakeReport {
  return reportFromBody(value);
}

export async function createStocktake(notes?: string): Promise<StocktakeReport> {
  const { status, body } = await requestJson<{ success: boolean; data?: unknown }>(
    '/api/mobile/stocktakes',
    {
      method: 'POST',
      body: JSON.stringify(notes?.trim() ? { notes: notes.trim() } : {}),
    },
  );
  if (!body.success) throw new PlacementApiError(status, body as unknown as ApiErrorBody);
  return reportFromBody(body);
}

export async function fetchStocktakeSessions(): Promise<StocktakeSession[]> {
  const { status, body } = await requestJson<{ success: boolean; data?: unknown }>(
    '/api/mobile/stocktakes',
  );
  if (!body.success) throw new PlacementApiError(status, body as unknown as ApiErrorBody);
  const data = body.data;
  const rows = Array.isArray(data)
    ? data
    : data && typeof data === 'object' && Array.isArray((data as { items?: unknown[] }).items)
      ? (data as { items: unknown[] }).items
      : data && typeof data === 'object' && Array.isArray((data as { sessions?: unknown[] }).sessions)
        ? (data as { sessions: unknown[] }).sessions
      : [];
  return rows.map(normalizeSession).filter(session => Boolean(session.id));
}

export async function fetchStocktake(sessionId: string): Promise<StocktakeReport> {
  const { status, body } = await requestJson<{ success: boolean; data?: unknown }>(
    `/api/mobile/stocktakes/${encodeURIComponent(sessionId)}`,
  );
  if (!body.success) throw new PlacementApiError(status, body as unknown as ApiErrorBody);
  return reportFromBody(body);
}

function normalizeScanResults(value: unknown): StocktakeScanResult[] {
  if (!Array.isArray(value)) return [];
  return value.map(row => {
    const raw = (row && typeof row === 'object' ? row : {}) as Record<string, unknown>;
    return {
      ...raw,
      rfid_number: String(raw.rfid_number ?? ''),
      accepted: raw.accepted === true,
      result: raw.result == null ? undefined : String(raw.result),
      error_code: raw.error_code == null ? undefined : String(raw.error_code),
      code: raw.code == null ? undefined : String(raw.code),
      message: raw.message == null ? undefined : String(raw.message),
    };
  });
}

export async function sendStocktakeScans(
  sessionId: string,
  rfidNumbers: string[],
  clientRequestId: string,
): Promise<StocktakeScanResponse> {
  try {
    const { status, body } = await requestJson<{
      success: boolean;
      data?: unknown;
      results?: unknown;
      reused?: boolean;
    }>(`/api/mobile/stocktakes/${encodeURIComponent(sessionId)}/scans`, {
      method: 'POST',
      body: JSON.stringify({ rfid_numbers: rfidNumbers, client_request_id: clientRequestId }),
    });
    if (!body.success) throw new PlacementApiError(status, body as unknown as ApiErrorBody);
    const data = bodyData(body);
    const raw = body as { report?: unknown; results?: unknown; errors?: unknown; reused?: boolean };
    return {
      report: reportFromBody(body),
      results: normalizeScanResults(raw.results ?? data.results ?? raw.errors),
      reused: Boolean(raw.reused ?? data.reused),
    };
  } catch (error) {
    if (!(error instanceof PlacementApiError) || error.status !== 409) throw error;
    const body = error.body as ApiErrorBody & {
      report?: unknown;
      data?: unknown;
      results?: unknown;
      errors?: unknown;
      reused?: boolean;
    };
    const data = bodyData(body);
    if (!body.report && !data.report && !data.session && !data.summary && !data.racks) throw error;
    return {
      report: reportFromBody(body),
      results: normalizeScanResults(body.results ?? data.results ?? body.errors),
      reused: Boolean(body.reused ?? data.reused),
    };
  }
}

export async function submitStocktake(
  sessionId: string,
): Promise<{ status: number; report: StocktakeReport; reused: boolean }> {
  const { status, body } = await requestJson<{
    success: boolean;
    data?: unknown;
    reused?: boolean;
  }>(`/api/mobile/stocktakes/${encodeURIComponent(sessionId)}/submit`, {
    method: 'POST',
  });
  if (!body.success) throw new PlacementApiError(status, body as unknown as ApiErrorBody);
  const data = bodyData(body);
  return {
    status,
    report: reportFromBody(body),
    reused: Boolean((body as { reused?: boolean }).reused ?? data.reused),
  };
}

export { PlacementTimeoutError };
