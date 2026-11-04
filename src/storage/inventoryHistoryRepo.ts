import type { InventoryHistoryEntry } from '../domain/types';
import { enqueue, readJson, writeJson } from './json';
import { KEYS } from './keys';

export async function listInventoryHistory(): Promise<InventoryHistoryEntry[]> {
  const rows = await readJson<InventoryHistoryEntry[]>(KEYS.inventoryHistory, []);
  return Array.isArray(rows) ? [...rows].reverse() : [];
}

export async function appendInventoryHistory(
  entries: InventoryHistoryEntry[],
): Promise<void> {
  if (entries.length === 0) return;
  const rows = await readJson<InventoryHistoryEntry[]>(KEYS.inventoryHistory, []);
  await writeJson(KEYS.inventoryHistory, [
    ...(Array.isArray(rows) ? rows : []),
    ...entries,
  ]);
}

export async function clearInventoryHistory(): Promise<void> {
  await enqueue(() => writeJson(KEYS.inventoryHistory, []));
}
