import type { Reading } from '../domain/types';
import { dayKeyOf } from '../domain/datetime';
import { KEYS, logKey } from './keys';
import { readJson, removeKey, writeJson } from './json';

/**
 * Log disimpan per hari: `optima:v1:log:YYYY-MM-DD`.
 *
 * Kenapa per hari, bukan satu array besar? Karena setiap scan melakukan
 * tulis-menyeluruh (AsyncStorage tidak punya partial update). Dengan chunk
 * harian, biaya tulis tidak tumbuh seiring bertambahnya riwayat.
 *
 * Cache di memori + flush tertunda (400 ms) membuat burst scan tetap ringan.
 */

const FLUSH_DELAY_MS = 400;

const cache = new Map<string, Reading[]>();
const dirty = new Set<string>();
let dayIndexCache: string[] | null = null;
let flushTimer: ReturnType<typeof setTimeout> | null = null;

async function loadDay(day: string): Promise<Reading[]> {
  const cached = cache.get(day);
  if (cached) {
    return cached;
  }
  const rows = await readJson<Reading[]>(logKey(day), []);
  const safe = Array.isArray(rows) ? rows : [];
  cache.set(day, safe);
  return safe;
}

async function loadIndex(): Promise<string[]> {
  if (dayIndexCache) {
    return dayIndexCache;
  }
  const days = await readJson<string[]>(KEYS.logIndex, []);
  dayIndexCache = Array.isArray(days) ? days : [];
  return dayIndexCache;
}

async function registerDay(day: string): Promise<void> {
  const days = await loadIndex();
  if (!days.includes(day)) {
    days.push(day);
    days.sort((a, b) => (a < b ? 1 : -1));
  }
}

async function flushDirty(): Promise<void> {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  const days = [...dirty];
  dirty.clear();
  for (const day of days) {
    await writeJson(logKey(day), cache.get(day) ?? []);
  }
  if (dayIndexCache) {
    await writeJson(KEYS.logIndex, dayIndexCache);
  }
}

function scheduleFlush(): void {
  if (flushTimer) {
    return;
  }
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushDirty();
  }, FLUSH_DELAY_MS);
}

export async function appendReading(reading: Reading): Promise<void> {
  const day = dayKeyOf(reading.atMs);
  const rows = await loadDay(day);
  rows.push(reading);
  dirty.add(day);
  await registerDay(day);
  scheduleFlush();
}

/** Paksa semua perubahan tertulis ke disk (app ke background / keluar layar). */
export async function flushLogs(): Promise<void> {
  await flushDirty();
}

export async function listByDay(day: string): Promise<Reading[]> {
  await flushDirty();
  const rows = await loadDay(day);
  return [...rows].reverse();
}

export async function listDays(): Promise<string[]> {
  await flushDirty();
  return [...(await loadIndex())];
}

export async function todayReadings(nowMs = Date.now()): Promise<Reading[]> {
  // Sengaja tidak memanggil flushDirty(): pemanggil (layar Scan) hanya butuh
  // data terbaru dari cache, dan flush tertunda tetap berjalan di background.
  const rows = await loadDay(dayKeyOf(nowMs));
  return [...rows].reverse();
}

export async function countReads(): Promise<number> {
  await flushDirty();
  const days = await loadIndex();
  let total = 0;
  for (const day of days) {
    const rows = await loadDay(day);
    total += rows.length;
  }
  return total;
}

export async function clearLogs(): Promise<void> {
  await flushDirty();
  const days = await loadIndex();
  for (const day of days) {
    await removeKey(logKey(day));
  }
  cache.clear();
  dirty.clear();
  dayIndexCache = [];
  await writeJson(KEYS.logIndex, []);
}

export async function deleteDay(day: string): Promise<void> {
  await flushDirty();
  cache.delete(day);
  await removeKey(logKey(day));
  const days = await loadIndex();
  const next = days.filter(d => d !== day);
  dayIndexCache = next;
  await writeJson(KEYS.logIndex, next);
}
