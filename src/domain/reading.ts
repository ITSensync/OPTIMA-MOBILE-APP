import type { Reading, ReadingStatus, TagRecord } from './types';

export type ClassificationResult = {
  isNew: boolean;
  duplicate: boolean;
  status: ReadingStatus;
  next: TagRecord;
};

/**
 * Tentukan status sebuah pembacaan tanpa menyentuh storage.
 * Dipisah sebagai fungsi murni supaya bisa diuji tanpa AsyncStorage.
 */
export function classifyReading(
  epc: string,
  existing: TagRecord | null,
  nowMs: number,
): ClassificationResult {
  const iso = new Date(nowMs).toISOString();

  if (!existing) {
    return {
      isNew: true,
      duplicate: false,
      status: 'new',
      next: {
        epc,
        firstSeenAt: iso,
        lastSeenAt: iso,
        readCount: 1,
      },
    };
  }

  const duplicate = true;

  return {
    isNew: false,
    duplicate,
    status: 'duplicate',
    next: {
      ...existing,
      epc,
      firstSeenAt: existing.firstSeenAt,
      lastSeenAt: iso,
      readCount: (existing.readCount ?? 0) + 1,
    },
  };
}

let counter = 0;

/** ID unik yang pendek dan sortable berdasarkan waktu. */
export function createReadingId(nowMs: number): string {
  counter = (counter + 1) % 1000;
  return `${nowMs.toString(36)}-${counter.toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 6)}`;
}

export function makeReading(
  epc: string,
  nowMs: number,
  status: ReadingStatus,
  readCount: number,
): Reading {
  return {
    id: createReadingId(nowMs),
    epc,
    at: new Date(nowMs).toISOString(),
    atMs: nowMs,
    status,
    readCount,
  };
}

/** Membaca riwayat versi lama yang hanya menyimpan `isNew`. */
export function getReadingStatus(
  reading: Pick<Reading, 'status' | 'isNew'>,
): ReadingStatus {
  if (
    reading.status === 'new' || reading.status === 'duplicate'
  ) {
    return reading.status;
  }
  // Riwayat versi lama marked as non-new is treated as a duplicate.
  return reading.isNew ? 'new' : 'duplicate';
}

export function summarize(rows: Reading[]): {
  reads: number;
  newTags: number;
  duplicates: number;
} {
  let newTags = 0;
  let duplicates = 0;
  for (const row of rows) {
    const status = getReadingStatus(row);
    if (status === 'new') {
      newTags += 1;
    } else {
      duplicates += 1;
    }
  }
  return { reads: rows.length, newTags, duplicates };
}
