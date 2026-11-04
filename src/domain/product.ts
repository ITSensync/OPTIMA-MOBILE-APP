export const PRODUCT_UNITS = ['pcs', 'gram', 'liter'] as const;
export type ProductUnit = (typeof PRODUCT_UNITS)[number];

export type ProductDetails = {
  productName: string;
  description: string;
  unit: ProductUnit;
  quantity: number;
};

export type ProductCompletenessInput = {
  productName?: string;
  description?: string;
  unit?: string;
  quantity?: number | string;
  room?: string;
  rack?: string;
};

export function parseQuantity(value: string): number | null {
  const normalized = value.trim().replace(',', '.');
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalized)) return null;
  const quantity = Number(normalized);
  return Number.isFinite(quantity) && quantity > 0 ? quantity : null;
}

export function isProductComplete(
  record: ProductCompletenessInput,
): boolean {
  const quantity = typeof record.quantity === 'string'
    ? parseQuantity(record.quantity)
    : record.quantity;
  return Boolean(
    record.productName?.trim() &&
      record.description?.trim() &&
      PRODUCT_UNITS.includes(record.unit as ProductUnit) &&
      typeof quantity === 'number' && Number.isFinite(quantity) && quantity > 0,
  );
}

export function missingProductFields(
  record: ProductCompletenessInput,
): string[] {
  const missing: string[] = [];
  if (!record.productName?.trim()) missing.push('nama barang');
  if (!record.description?.trim()) missing.push('deskripsi');
  if (!PRODUCT_UNITS.includes(record.unit as ProductUnit)) missing.push('satuan');
  const quantity = typeof record.quantity === 'string'
    ? parseQuantity(record.quantity)
    : record.quantity;
  if (typeof quantity !== 'number' || !Number.isFinite(quantity) || quantity <= 0) {
    missing.push('jumlah');
  }
  if (!record.room?.trim() || !record.rack?.trim()) missing.push('penempatan');
  return missing;
}
