import type { ScanOutcome, TagRecord } from '../domain/types';
import { PRODUCT_UNITS } from '../domain/product';
import { classifyReading, makeReading } from '../domain/reading';
import { KEYS, tagKey } from './keys';
import { enqueue, readJson, readManyJson, removeKey, writeJson } from './json';
import { appendReading } from './logRepo';

/**
 * Master tag disimpan satu key per tag (`optima:v1:tag:<EPC>`) plus
 * satu index berisi daftar EPC. Pola ini menghindari penulisan ulang
 * seluruh koleksi setiap kali ada tag baru.
 */

export async function getTagIndex(): Promise<string[]> {
  const index = await readJson<string[]>(KEYS.tagIndex, []);
  return Array.isArray(index) ? index : [];
}

export async function getTag(epc: string): Promise<TagRecord | null> {
  const tag = await readJson<TagRecord | null>(tagKey(epc), null);
  if (!tag || typeof tag.epc !== 'string' || tag.epc !== epc) {
    return null;
  }
  return {
    epc: tag.epc,
    firstSeenAt: tag.firstSeenAt,
    lastSeenAt: tag.lastSeenAt,
    readCount: Number(tag.readCount) || 1,
    productName: typeof tag.productName === 'string' ? tag.productName : undefined,
    description: typeof tag.description === 'string' ? tag.description : undefined,
    unit: tag.unit && PRODUCT_UNITS.includes(tag.unit) ? tag.unit : undefined,
    quantity: typeof tag.quantity === 'number' && Number.isFinite(tag.quantity) ? tag.quantity : undefined,
    room: typeof tag.room === 'string' ? tag.room : undefined,
    rack: typeof tag.rack === 'string' ? tag.rack : undefined,
    inventoryStatus:
      tag.inventoryStatus === 'outbound' ||
      tag.inventoryStatus === 'in_stock' ||
      tag.inventoryStatus === 'pending_location'
        ? tag.inventoryStatus
        : undefined,
  };
}

export async function listTags(): Promise<TagRecord[]> {
  const index = await getTagIndex();
  const rows = await readManyJson<TagRecord>(index.map(tagKey));
  const tags: TagRecord[] = [];
  rows.forEach((row, i) => {
    if (!row || typeof row.epc !== 'string') {
      return;
    }
    tags.push({
      epc: row.epc,
      firstSeenAt: row.firstSeenAt,
      lastSeenAt: row.lastSeenAt,
      readCount: Number(row.readCount) || 1,
      productName: typeof row.productName === 'string' ? row.productName : undefined,
      description: typeof row.description === 'string' ? row.description : undefined,
      unit: row.unit && PRODUCT_UNITS.includes(row.unit) ? row.unit : undefined,
      quantity: typeof row.quantity === 'number' && Number.isFinite(row.quantity) ? row.quantity : undefined,
      room: typeof row.room === 'string' ? row.room : undefined,
      rack: typeof row.rack === 'string' ? row.rack : undefined,
      inventoryStatus:
        row.inventoryStatus === 'outbound' ||
        row.inventoryStatus === 'in_stock' ||
        row.inventoryStatus === 'pending_location'
          ? row.inventoryStatus
          : undefined,
    });
    // Index bisa saja basi; tidak masalah, hanya untuk urutan.
    void i;
  });
  tags.sort((a, b) => Date.parse(b.lastSeenAt) - Date.parse(a.lastSeenAt));
  return tags;
}

export async function countTags(): Promise<number> {
  return (await getTagIndex()).length;
}

export async function saveTag(tag: TagRecord): Promise<void> {
  await writeJson(tagKey(tag.epc), tag);
  const index = await getTagIndex();
  if (!index.includes(tag.epc)) {
    index.unshift(tag.epc);
    await writeJson(KEYS.tagIndex, index);
  }
}

/**
 * Inti alur bisnis: catat satu pembacaan.
 * Mengembalikan status TAG/DUPLIKAT dan selalu membuat baris riwayat.
 */
export async function recordReading(
  epc: string,
  options: { nowMs?: number },
): Promise<ScanOutcome> {
  return enqueue(async () => {
    const nowMs = options.nowMs ?? Date.now();
    const existing = await getTag(epc);
    const { next, duplicate, status } = classifyReading(epc, existing, nowMs);

    await saveTag(next);

    const reading = makeReading(epc, nowMs, status, next.readCount);
    await appendReading(reading);
    return { tag: next, reading, duplicate };
  });
}

async function removeTagRecord(epc: string): Promise<void> {
  await removeKey(tagKey(epc));
  const index = await getTagIndex();
  await writeJson(KEYS.tagIndex, index.filter(item => item !== epc));
}

/** Remove an unconfirmed inbound record while preserving its separate draft. */
export async function removeTagFromMaster(epc: string): Promise<void> {
  await enqueue(() => removeTagRecord(epc));
}

export async function deleteTag(epc: string): Promise<void> {
  await enqueue(async () => {
    await removeTagRecord(epc);
    const pending = await readJson<Array<{ epc: string }>>(
      KEYS.pendingPlacements,
      [],
    );
    await writeJson(
      KEYS.pendingPlacements,
      (Array.isArray(pending) ? pending : []).filter(item => item.epc !== epc),
    );
  });
}

export async function clearTags(): Promise<void> {
  await enqueue(async () => {
    const index = await getTagIndex();
    for (const epc of index) {
      await removeKey(tagKey(epc));
    }
    await writeJson(KEYS.tagIndex, []);
    await writeJson(KEYS.pendingPlacements, []);
  });
}
