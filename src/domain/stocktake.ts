import type { StocktakeItem, StocktakeRack, StocktakeStatus } from '../api/stocktakeApi';

export const STOCKTAKE_RESULT_LABELS: Record<string, string> = {
  pending: 'Belum terbaca',
  matched: 'Sesuai',
  missing: 'Belum terbaca',
  lifecycle_changed: 'Lifecycle berubah',
};

export const STOCKTAKE_STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  cancelled: 'Dibatalkan',
};

export function stocktakeResultLabel(result?: string): string {
  return STOCKTAKE_RESULT_LABELS[result ?? ''] ?? result ?? 'Tidak diketahui';
}

export function stocktakeStatusLabel(status?: StocktakeStatus): string {
  return STOCKTAKE_STATUS_LABELS[status ?? ''] ?? status ?? 'Tidak diketahui';
}

export function stocktakeRackLabel(rack?: StocktakeRack['rack'] | null): string {
  return rack ? `${rack.code}${rack.name ? ` · ${rack.name}` : ''}` : 'Rak tidak tersedia';
}

export function stocktakeItemLocation(item: StocktakeItem): string {
  return stocktakeRackLabel(item.expected_rack ?? item.observed_rack);
}
