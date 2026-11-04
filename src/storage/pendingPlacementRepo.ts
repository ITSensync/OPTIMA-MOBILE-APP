import type { PendingPlacement } from '../domain/types';
import { missingProductFields } from '../domain/product';
import { KEYS } from './keys';
import { enqueue, readJson, writeJson } from './json';
import { listTags, removeTagFromMaster } from './tagRepo';

export async function listPendingPlacements(): Promise<PendingPlacement[]> {
  const rows = await readJson<PendingPlacement[]>(KEYS.pendingPlacements, []);
  return Array.isArray(rows) ? rows : [];
}

export async function registerPendingPlacement(
  epc: string,
  scannedAt = Date.now(),
  details: Partial<Omit<PendingPlacement, 'epc' | 'scannedAt'>> = {},
): Promise<void> {
  await enqueue(async () => {
    const rows = await listPendingPlacements();
    const previous = rows.find(row => row.epc === epc);
    const next = rows.filter(row => row.epc !== epc);
    next.push({
      epc,
      scannedAt: previous?.scannedAt ?? scannedAt,
      ...details,
      ...previous,
    });
    await writeJson(KEYS.pendingPlacements, next);
  });
}

export async function updatePendingPlacement(
  epc: string,
  patch: Partial<Omit<PendingPlacement, 'epc' | 'scannedAt'>>,
): Promise<void> {
  await enqueue(async () => {
    const rows = await listPendingPlacements();
    await writeJson(
      KEYS.pendingPlacements,
      rows.map(row => row.epc === epc ? { ...row, ...patch } : row),
    );
  });
}

export async function updatePendingPlacementDrafts(
  epcs: string[],
  patch: Partial<Omit<PendingPlacement, 'epc' | 'scannedAt'>>,
): Promise<void> {
  const targets = new Set(epcs);
  if (targets.size === 0) return;
  await enqueue(async () => {
    const rows = await listPendingPlacements();
    await writeJson(
      KEYS.pendingPlacements,
      rows.map(row => targets.has(row.epc) ? { ...row, ...patch } : row),
    );
  });
}

export async function removePendingPlacements(epcs: string[]): Promise<void> {
  const remove = new Set(epcs);
  await enqueue(async () => {
    const rows = await listPendingPlacements();
    await writeJson(KEYS.pendingPlacements, rows.filter(row => !remove.has(row.epc)));
  });
}

export async function clearPendingPlacements(): Promise<void> {
  await enqueue(() => writeJson(KEYS.pendingPlacements, []));
}

/** Reconcile persisted reminders with inventory records whenever the app starts. */
export async function reconcilePendingPlacements(): Promise<PendingPlacement[]> {
  const rows = await listPendingPlacements();
  const existing = new Map(rows.map(row => [row.epc, row]));
  const initialTags = await listTags();
  const unconfirmedInbound = initialTags.filter(tag => tag.inventoryStatus === 'pending_location');
  for (const tag of unconfirmedInbound) {
    await registerPendingPlacement(
      tag.epc,
      existing.get(tag.epc)?.scannedAt ?? (Date.parse(tag.firstSeenAt) || Date.parse(tag.lastSeenAt) || Date.now()),
      {
        firstSeenAt: tag.firstSeenAt,
        readCount: tag.readCount,
        productName: tag.productName,
        description: tag.description,
        unit: tag.unit,
        quantity: tag.quantity === undefined ? undefined : String(tag.quantity),
        room: tag.room,
        rack: tag.rack,
      },
    );
    await removeTagFromMaster(tag.epc);
  }

  const tags = await listTags();
  const tagsByEpc = new Map(tags.map(tag => [tag.epc, tag]));
  const incomplete = tags.filter(tag =>
    tag.inventoryStatus !== 'outbound' && missingProductFields(tag).length > 0,
  );
  for (const tag of incomplete) {
    await registerPendingPlacement(
      tag.epc,
      existing.get(tag.epc)?.scannedAt ?? (Date.parse(tag.firstSeenAt) || Date.parse(tag.lastSeenAt) || Date.now()),
      {
        productName: tag.productName,
        description: tag.description,
        unit: tag.unit,
        quantity: tag.quantity === undefined ? undefined : String(tag.quantity),
        room: tag.room,
        rack: tag.rack,
      },
    );
  }
  const validEpcs = new Set([
    ...incomplete.map(tag => tag.epc),
    ...unconfirmedInbound.map(tag => tag.epc),
  ]);
  const stale = rows.filter(row => {
    const tag = tagsByEpc.get(row.epc);
    return Boolean(tag && !validEpcs.has(row.epc));
  });
  if (stale.length) await removePendingPlacements(stale.map(row => row.epc));
  return listPendingPlacements();
}
