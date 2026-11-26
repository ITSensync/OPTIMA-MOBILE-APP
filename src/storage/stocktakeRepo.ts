import { KEYS } from './keys';
import { enqueue, readJson, removeKey, writeJson } from './json';
import type { PendingStocktakeScan } from '../api/stocktakeApi';

export async function getPendingStocktakeScan(): Promise<PendingStocktakeScan | null> {
  const value = await readJson<PendingStocktakeScan | null>(KEYS.pendingStocktakeScan, null);
  if (
    !value ||
    typeof value.stocktakeSessionId !== 'string' ||
    typeof value.clientRequestId !== 'string' ||
    !Array.isArray(value.rfidNumbers) ||
    value.rfidNumbers.some(rfid => typeof rfid !== 'string')
  ) {
    return null;
  }
  return value;
}

export async function savePendingStocktakeScan(
  submission: PendingStocktakeScan,
): Promise<void> {
  await enqueue(() => writeJson(KEYS.pendingStocktakeScan, submission));
}

export async function clearPendingStocktakeScan(): Promise<void> {
  await enqueue(() => removeKey(KEYS.pendingStocktakeScan));
}
