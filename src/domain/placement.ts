import type { HistoryItem } from '../api/placementApi';

export type PlacementHistoryGroup = {
  key: string;
  clientRequestId?: string;
  createdAt: string;
  movementType: string;
  rack?: HistoryItem['rack'];
  fromRacks: NonNullable<HistoryItem['from_rack']>[];
  total: number;
  statuses: string[];
  items: HistoryItem[];
};

export function groupPlacementHistory(
  items: HistoryItem[],
): PlacementHistoryGroup[] {
  const groups = new Map<string, PlacementHistoryGroup>();
  for (const item of items) {
    const rfidNumber = item.rfid_number ?? item.item?.rfid_number;
    const status = item.placement_status ?? item.item?.placement_status;
    const key = item.client_request_id || item.id || rfidNumber || item.created_at;
    const existing = groups.get(key);
    if (existing) {
      existing.total += 1;
      existing.items.push(item);
      if (item.from_rack && !existing.fromRacks.some(rack => rack.id === item.from_rack?.id)) {
        existing.fromRacks.push(item.from_rack);
      }
      if (status && !existing.statuses.includes(status)) {
        existing.statuses.push(status);
      }
      continue;
    }
    groups.set(key, {
      key,
      clientRequestId: item.client_request_id ?? undefined,
      createdAt: item.created_at,
      movementType: item.movement_type,
      rack: item.rack ?? undefined,
      fromRacks: item.from_rack ? [item.from_rack] : [],
      total: 1,
      statuses: status ? [status] : [],
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
