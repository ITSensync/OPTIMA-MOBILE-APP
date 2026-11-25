import type { PreviewItem } from '../api/placementApi';

export type RelocationRackSummary = {
  source: string;
  count: number;
};

export type RelocationProductSummary = {
  product: string;
  count: number;
};

function rackLabel(rack: PreviewItem['current_rack']): string {
  return rack ? `${rack.code}${rack.name ? ` · ${rack.name}` : ''}` : 'Rak asal tidak tersedia';
}

export function summarizeRelocation(items: PreviewItem[]): {
  byRack: RelocationRackSummary[];
  byProduct: RelocationProductSummary[];
} {
  const byRack = new Map<string, number>();
  const byProduct = new Map<string, number>();

  for (const item of items) {
    const source = rackLabel(item.current_rack);
    byRack.set(source, (byRack.get(source) ?? 0) + 1);
    const product = item.product_name || item.sku || 'Produk tidak tersedia';
    byProduct.set(product, (byProduct.get(product) ?? 0) + 1);
  }

  return {
    byRack: [...byRack.entries()].map(([source, count]) => ({ source, count })),
    byProduct: [...byProduct.entries()].map(([product, count]) => ({ product, count })),
  };
}
