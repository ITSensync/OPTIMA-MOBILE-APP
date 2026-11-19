import type { HistoryItem } from '../api/placementApi';

export type PlacementHistoryGroup = {
  key: string;
  clientRequestId?: string;
  createdAt: string;
  movementType: string;
  rack?: HistoryItem['rack'];
  total: number;
  statuses: string[];
  items: HistoryItem[];
};

export function groupPlacementHistory(
  items: HistoryItem[],
): PlacementHistoryGroup[] {
  const groups = new Map<string, PlacementHistoryGroup>();
  for (const item of items) {
    const key = item.client_request_id || item.id || item.rfid_number || item.created_at;
    const existing = groups.get(key);
    if (existing) {
      existing.total += 1;
      existing.items.push(item);
      if (item.placement_status && !existing.statuses.includes(item.placement_status)) {
        existing.statuses.push(item.placement_status);
      }
      continue;
    }
    groups.set(key, {
      key,
      clientRequestId: item.client_request_id ?? undefined,
      createdAt: item.created_at,
      movementType: item.movement_type,
      rack: item.rack ?? undefined,
      total: 1,
      statuses: item.placement_status ? [item.placement_status] : [],
      items: [item],
    });
  }
  return [...groups.values()].sort(
    (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
  );
}

export function movementLabel(value: string): string {
  const labels: Record<string, string> = {
    placement: 'Ditempatkan',
    relocation: 'Dipindahkan',
    outbound: 'Barang keluar',
    trash: 'Dibuang',
  };
  return labels[value.toLowerCase()] ?? value;
}

export function placementStatusLabel(value: string): string {
  const labels: Record<string, string> = {
    placed: 'Sudah ditempatkan',
    unplaced: 'Belum ditempatkan',
  };
  return labels[value.toLowerCase()] ?? value;
}
