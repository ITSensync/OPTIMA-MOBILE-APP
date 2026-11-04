import type {
  InventoryLocation,
  InventoryHistoryEntry,
  InventoryOperation,
  InventoryTransaction,
  PendingPlacement,
  TagRecord,
} from '../domain/types';
import type { ProductDetails } from '../domain/product';
import { isProductComplete } from '../domain/product';
import { KEYS } from './keys';
import { enqueue, readJson, writeJson } from './json';
import { getTag, saveTag } from './tagRepo';
import { appendInventoryHistory } from './inventoryHistoryRepo';

export async function listInventoryTransactions(): Promise<InventoryTransaction[]> {
  const rows = await readJson<InventoryTransaction[]>(KEYS.inventoryTransactions, []);
  return Array.isArray(rows) ? [...rows].reverse() : [];
}

export async function clearInventoryTransactions(): Promise<void> {
  await enqueue(() => writeJson(KEYS.inventoryTransactions, []));
}

export async function completeExistingTagDetails(
  epc: string,
  details: ProductDetails & InventoryLocation,
): Promise<void> {
  if (!isProductComplete(details) || !details.room.trim() || !details.rack.trim()) {
    throw new Error('Lengkapi data produk, jumlah, satuan, dan penempatan terlebih dahulu.');
  }
  await enqueue(async () => {
    const existing = await getTag(epc);
    if (!existing) throw new Error(`Tag ${epc} tidak ditemukan.`);
    await saveTag({
      ...existing,
      productName: details.productName.trim(),
      description: details.description.trim(),
      unit: details.unit,
      quantity: details.quantity,
      room: details.room.trim(),
      rack: details.rack.trim(),
    });
  });
}

/** Keep an inbound scan as a local draft until the operator confirms it. */
export async function registerInboundScan(epc: string, scannedAt: number): Promise<void> {
  await enqueue(async () => {
    const existing = await getTag(epc);
    if (existing?.inventoryStatus === 'in_stock') {
      throw new Error('Barang ini sudah berada dalam stok. Gunakan Relocation atau Outbound.');
    }
    const pending = await readJson<PendingPlacement[]>(
      KEYS.pendingPlacements,
      [],
    );
    const pendingRows = Array.isArray(pending) ? pending : [];
    const previous = pendingRows.find(item => item.epc === epc);
    const next = pendingRows.filter(item => item.epc !== epc);
    next.push({
      epc,
      scannedAt: previous?.scannedAt ?? scannedAt,
      firstSeenAt: previous?.firstSeenAt ?? existing?.firstSeenAt ?? new Date(scannedAt).toISOString(),
      readCount: previous?.readCount ?? (existing?.readCount ?? 0) + 1,
      productName: existing?.productName,
      description: existing?.description,
      unit: existing?.unit,
      quantity: existing?.quantity === undefined ? undefined : String(existing.quantity),
      room: existing?.room,
      rack: existing?.rack,
      ...previous,
    });
    await writeJson(KEYS.pendingPlacements, next);
  });
}

export async function commitInventoryOperation(
  operation: InventoryOperation,
  epcs: string[],
  location?: InventoryLocation,
  detailsByEpc?: Record<string, ProductDetails & InventoryLocation>,
): Promise<InventoryTransaction> {
  return enqueue(async () => {
    const uniqueEpcs = [...new Set(epcs)];
    if (uniqueEpcs.length === 0) throw new Error('Belum ada barang yang dipindai.');
    if (operation === 'relocation' &&
      (!location?.room.trim() || !location.rack.trim())) {
      throw new Error('Ruangan dan rak wajib diisi.');
    }

    const changed: TagRecord[] = [];
    const newlyRegistered: string[] = [];
    let from: InventoryLocation | undefined;
    const locationsByEpc: Record<string, InventoryLocation> = {};
    const pendingRows = await readJson<PendingPlacement[]>(KEYS.pendingPlacements, []);
    const pendingByEpc = new Map((Array.isArray(pendingRows) ? pendingRows : []).map(row => [row.epc, row]));
    for (const epc of uniqueEpcs) {
      const existing = await getTag(epc);
      if (operation === 'outbound') {
        if (!existing || existing.inventoryStatus !== 'in_stock') {
          throw new Error(`Tag ${epc} tidak ditemukan dalam stok.`);
        }
        changed.push({ ...existing, inventoryStatus: 'outbound' });
      } else if (operation === 'relocation') {
        if (!existing || existing.inventoryStatus !== 'in_stock') {
          throw new Error(`Tag ${epc} tidak ditemukan dalam stok.`);
        }
        if (!from) from = { room: existing.room ?? '', rack: existing.rack ?? '' };
        changed.push({ ...existing, room: location!.room.trim(), rack: location!.rack.trim() });
      } else {
        if (existing?.inventoryStatus === 'in_stock') {
          throw new Error(`Tag ${epc} sudah berada dalam stok; gunakan relocation atau outbound.`);
        }
        const details = detailsByEpc?.[epc];
        if (!details || !isProductComplete(details) || !details.room.trim() || !details.rack.trim()) {
          throw new Error(`Lengkapi nama, deskripsi, satuan, jumlah, dan penempatan untuk tag ${epc}.`);
        }
        locationsByEpc[epc] = { room: details.room.trim(), rack: details.rack.trim() };
        if (!existing) newlyRegistered.push(epc);
        changed.push({
          ...existing,
          epc,
          firstSeenAt: existing?.firstSeenAt ?? pendingByEpc.get(epc)?.firstSeenAt ?? new Date().toISOString(),
          lastSeenAt: new Date().toISOString(),
          readCount: existing?.inventoryStatus === 'pending_location'
            ? existing.readCount
            : existing
            ? existing.readCount + 1
            : pendingByEpc.get(epc)?.readCount ?? 1,
          productName: details.productName.trim(),
          description: details.description.trim(),
          unit: details.unit,
          quantity: details.quantity,
          room: details.room.trim(),
          rack: details.rack.trim(),
          inventoryStatus: 'in_stock',
        });
      }
    }

    for (const tag of changed) await saveTag(tag);

    const atMs = Date.now();
    const transaction: InventoryTransaction = {
      id: `${atMs.toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      operation,
      at: new Date(atMs).toISOString(),
      atMs,
      tags: uniqueEpcs,
      from,
      to: operation === 'inbound'
        ? (() => {
            const locations = Object.values(locationsByEpc);
            return locations.length > 0 && locations.every(item => item.room === locations[0].room && item.rack === locations[0].rack)
              ? locations[0]
              : undefined;
          })()
        : location,
      locationsByEpc: operation === 'inbound' ? locationsByEpc : undefined,
    };
    const stored = await readJson<InventoryTransaction[]>(KEYS.inventoryTransactions, []);
    await writeJson(KEYS.inventoryTransactions, [...(Array.isArray(stored) ? stored : []), transaction]);
    const historyEntries: InventoryHistoryEntry[] = newlyRegistered.map(epc => ({
        id: `tag-${atMs.toString(36)}-${epc}`,
        kind: 'tag_registered' as const,
        at: new Date(atMs).toISOString(),
        atMs,
        tags: [epc],
      }));
    await appendInventoryHistory(historyEntries);
    return transaction;
  });
}
