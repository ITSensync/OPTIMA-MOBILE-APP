import { API_BASE_URL } from '../config';

export type Rack = {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  status: string;
};

export type RackReference = Pick<Rack, 'id' | 'code' | 'name'>;

export type PreviewItem = {
  rfid_number: string;
  rfid_tag_id?: number;
  pack_plan_id?: string;
  pack_number?: number;
  label_code?: string | null;
  product_id?: string;
  units?: number | null;
  base_unit?: string | null;
  expires_on?: string | null;
  placement_status?: string | null;
  current_rack?: RackReference | null;
  target_rack?: RackReference | null;
  eligible: boolean;
  product_name?: string | null;
  sku?: string | null;
  error_code?: string;
  message?: string;
  [key: string]: unknown;
};

export type PreviewData = {
  eligible: boolean;
  items: PreviewItem[];
};

export type RelocationPreviewData = PreviewData & {
  target_rack?: RackReference | null;
};

export type PlacementResponseData = {
  client_request_id?: string;
  reused?: boolean;
  rack?: Rack;
  total_placed?: number;
  total_relocated?: number;
  placed_at?: string;
  items?: unknown[];
  [key: string]: unknown;
};

export type HistoryItem = {
  id?: string;
  created_at: string;
  movement_type: string;
  client_request_id?: string | null;
  rack?: RackReference | null;
  from_rack?: RackReference | null;
  placement_status?: string | null;
  rfid_number?: string;
  item?: {
    rfid_number?: string;
    pack_plan_id?: string;
    pack_number?: number;
    sku?: string | null;
    product_name?: string | null;
    placement_status?: string | null;
  } | null;
  [key: string]: unknown;
};

export type HistoryData = {
  total: number;
  limit: number;
  offset: number;
  items: HistoryItem[];
};

export type ApiErrorEntry = {
  field?: string;
  code?: string;
  message?: string;
};

export type ApiErrorBody = {
  success?: false;
  message?: string;
  errors?: ApiErrorEntry[];
  [key: string]: unknown;
};

export class PlacementApiError extends Error {
  readonly status: number;
  readonly body: ApiErrorBody;

  constructor(status: number, body: ApiErrorBody) {
    super(body.message || `API request gagal (${status})`);
    this.name = 'PlacementApiError';
    this.status = status;
    this.body = body;
  }
}

export class PlacementTimeoutError extends Error {
  constructor() {
    super('Request API melewati batas waktu.');
    this.name = 'PlacementTimeoutError';
  }
}

const REQUEST_TIMEOUT_MS = 15_000;

function apiUrl(path: string): string {
  if (!API_BASE_URL) {
    throw new Error(
      'API_BASE_URL belum dikonfigurasi. Atur API_BASE_URL saat build production.',
    );
  }
  return `${API_BASE_URL.replace(/\/$/, '')}${path}`;
}

async function requestJson<T>(
  path: string,
  init: RequestInit = {},
): Promise<{ status: number; body: T }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(apiUrl(path), {
      ...init,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...init.headers,
      },
    });
    const body = (await response.json().catch(() => ({}))) as T;
    if (!response.ok) {
      throw new PlacementApiError(response.status, body as ApiErrorBody);
    }
    return { status: response.status, body };
  } catch (error) {
    if (error instanceof PlacementApiError) {
      throw error;
    }
    if (error instanceof Error && error.name === 'AbortError') {
      throw new PlacementTimeoutError();
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchActiveRacks(): Promise<Rack[]> {
  const { status, body } = await requestJson<{ success: boolean; data: Rack[] }>(
    '/api/mobile/racks?status=active',
  );
  if (!body.success) {
    throw new PlacementApiError(status, body as unknown as ApiErrorBody);
  }
  return Array.isArray(body.data)
    ? body.data.filter(rack => rack.status.toLowerCase() === 'active')
    : [];
}

export async function previewPlacement(
  rfidNumbers: string[],
): Promise<PreviewData> {
  const { status, body } = await requestJson<{ success: boolean; data: PreviewData }>(
    '/api/mobile/placements/preview',
    {
      method: 'POST',
      body: JSON.stringify({ rfid_numbers: rfidNumbers }),
    },
  );
  if (!body.success) {
    throw new PlacementApiError(status, body as unknown as ApiErrorBody);
  }
  return {
    eligible: Boolean(body.data?.eligible),
    items: Array.isArray(body.data?.items) ? body.data.items : [],
  };
}

export async function createPlacement(
  rackId: string,
  rfidNumbers: string[],
  clientRequestId: string,
): Promise<{ status: number; data: PlacementResponseData }> {
  const { status, body } = await requestJson<{
    success: boolean;
    data: PlacementResponseData;
    reused?: boolean;
  }>('/api/mobile/placements', {
    method: 'POST',
    body: JSON.stringify({
      rack_id: rackId,
      rfid_numbers: rfidNumbers,
      client_request_id: clientRequestId,
    }),
  });

  if (!body.success) {
    throw new PlacementApiError(status, body as unknown as ApiErrorBody);
  }
  return {
    status,
    data: {
      ...(body.data ?? {}),
      reused: body.data?.reused ?? body.reused,
    },
  };
}

export async function previewRelocation(
  rackId: string,
  rfidNumbers: string[],
): Promise<RelocationPreviewData> {
  const { status, body } = await requestJson<{
    success: boolean;
    data: RelocationPreviewData;
  }>('/api/mobile/placements/relocation/preview', {
    method: 'POST',
    body: JSON.stringify({ rack_id: rackId, rfid_numbers: rfidNumbers }),
  });

  if (!body.success) {
    throw new PlacementApiError(status, body as unknown as ApiErrorBody);
  }

  return {
    eligible: Boolean(body.data?.eligible),
    target_rack: body.data?.target_rack ?? null,
    items: Array.isArray(body.data?.items) ? body.data.items : [],
  };
}

export async function createRelocation(
  rackId: string,
  rfidNumbers: string[],
  clientRequestId: string,
): Promise<{ status: number; data: PlacementResponseData }> {
  const { status, body } = await requestJson<{
    success: boolean;
    data: PlacementResponseData;
    reused?: boolean;
  }>('/api/mobile/placements/relocation', {
    method: 'POST',
    body: JSON.stringify({
      rack_id: rackId,
      rfid_numbers: rfidNumbers,
      client_request_id: clientRequestId,
    }),
  });

  if (!body.success) {
    throw new PlacementApiError(status, body as unknown as ApiErrorBody);
  }

  return {
    status,
    data: {
      ...(body.data ?? {}),
      reused: body.data?.reused ?? body.reused,
    },
  };
}

export async function fetchPlacementHistory(
  limit = 20,
  offset = 0,
): Promise<HistoryData> {
  const { status, body } = await requestJson<{ success: boolean; data: HistoryData }>(
    `/api/mobile/placements/history?limit=${limit}&offset=${offset}`,
  );
  if (!body.success) {
    throw new PlacementApiError(status, body as unknown as ApiErrorBody);
  }
  return {
    total: Number(body.data?.total ?? 0),
    limit: Number(body.data?.limit ?? limit),
    offset: Number(body.data?.offset ?? offset),
    items: Array.isArray(body.data?.items) ? body.data.items : [],
  };
}

export function isReusableSuccess(
  status: number,
  data: PlacementResponseData,
): boolean {
  return status === 200 && data.reused === true;
}

export function isInitialPlacementSuccess(status: number): boolean {
  return status === 201;
}

export function isFinalActionSuccess(
  status: number,
  data: PlacementResponseData,
): boolean {
  return status === 201 || isReusableSuccess(status, data);
}
