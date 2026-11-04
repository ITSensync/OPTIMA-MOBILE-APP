import type { Placement } from '../domain/types';
import { KEYS } from './keys';
import { enqueue, readJson, writeJson } from './json';
import { listInventoryTransactions } from './inventoryRepo';
import { listPendingPlacements } from './pendingPlacementRepo';
import { listTags } from './tagRepo';

function placementId(room: string, rack: string): string {
  return `${room.trim().toLocaleLowerCase()}\u0000${rack.trim().toLocaleLowerCase()}`;
}

function normalizePlacement(room: string, rack: string, createdAt = new Date().toISOString()): Placement {
  const normalizedRoom = room.trim();
  const normalizedRack = rack.trim();
  return {
    id: placementId(normalizedRoom, normalizedRack),
    room: normalizedRoom,
    rack: normalizedRack,
    createdAt,
  };
}

/** Load saved locations and preserve existing locations as selectable entries. */
export async function listPlacements(): Promise<Placement[]> {
  const saved = await readJson<Placement[]>(KEYS.placements, []);
  const rows = Array.isArray(saved) ? saved : [];
  const byId = new Map<string, Placement>();
  for (const row of rows) {
    if (typeof row?.room === 'string' && typeof row?.rack === 'string' && row.room.trim() && row.rack.trim()) {
      const placement = normalizePlacement(row.room, row.rack, row.createdAt);
      byId.set(placement.id, placement);
    }
  }

  const migrated = await readJson<boolean>(KEYS.placementsMigrated, false);
  if (!migrated) {
    const [tags, transactions, pending] = await Promise.all([
      listTags(),
      listInventoryTransactions(),
      listPendingPlacements(),
    ]);
    const legacyLocations = [
      ...tags.map(tag => ({ room: tag.room, rack: tag.rack })),
      ...transactions.flatMap(transaction => transaction.to ? [transaction.to] : []),
      ...pending.map(item => ({ room: item.room, rack: item.rack })),
    ];
    for (const location of legacyLocations) {
      if (!location.room?.trim() || !location.rack?.trim()) continue;
      const placement = normalizePlacement(location.room, location.rack);
      if (!byId.has(placement.id)) byId.set(placement.id, placement);
    }
  }

  const result = [...byId.values()].sort((a, b) => a.room.localeCompare(b.room) || a.rack.localeCompare(b.rack));
  if (!migrated || result.length !== rows.length || result.some((item, index) => item.id !== rows[index]?.id)) {
    await Promise.all([
      writeJson(KEYS.placements, result),
      writeJson(KEYS.placementsMigrated, true),
    ]);
  }
  return result;
}

export async function savePlacement(input: { id?: string; room: string; rack: string }): Promise<Placement> {
  const room = input.room.trim();
  const rack = input.rack.trim();
  if (!room || !rack) throw new Error('Ruangan dan rak wajib diisi.');

  return enqueue(async () => {
    const rows = await listPlacements();
    const placement = normalizePlacement(
      room,
      rack,
      rows.find(row => row.id === input.id)?.createdAt,
    );
    if (rows.some(row => row.id !== input.id && row.id === placement.id)) {
      throw new Error('Pasangan ruangan dan rak ini sudah ada di daftar.');
    }
    const next = input.id ? rows.filter(row => row.id !== input.id) : rows;
    next.push(placement);
    await writeJson(KEYS.placements, next);
    return placement;
  });
}

export async function deletePlacement(id: string): Promise<void> {
  await enqueue(async () => {
    const rows = await listPlacements();
    await writeJson(KEYS.placements, rows.filter(row => row.id !== id));
  });
}
