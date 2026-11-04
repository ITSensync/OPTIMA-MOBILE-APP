import { Share } from 'react-native';
import type { InventoryHistoryEntry, Reading } from '../domain/types';
import { localDateTime } from '../domain/datetime';
import { getReadingStatus } from '../domain/reading';

function escapeCsv(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function readingsToCsv(rows: Reading[]): string {
  const header = 'epc,waktu_iso,waktu_lokal,status,read_count';
  const lines = rows.map(row =>
    [
      escapeCsv(row.epc),
      escapeCsv(row.at),
      escapeCsv(localDateTime(row.at)),
      getReadingStatus(row) === 'new'
        ? 'BARU'
        : 'DUPLIKAT',
      String(row.readCount),
    ].join(','),
  );
  return [header, ...lines].join('\n');
}

export function inventoryHistoryToCsv(rows: InventoryHistoryEntry[]): string {
  const header = 'jenis,waktu,epc,lokasi_asal,lokasi_tujuan';
  const lines = rows.map(row => [
    row.kind === 'tag_registered' ? 'TAG BARU TERDAFTAR' : row.kind.toUpperCase(),
    escapeCsv(localDateTime(row.at)),
    escapeCsv(row.tags.join(';')),
    escapeCsv(row.from ? `${row.from.room} / ${row.from.rack}` : ''),
    escapeCsv(row.to ? `${row.to.room} / ${row.to.rack}` : ''),
  ].join(','));
  return [header, ...lines].join('\n');
}

/**
 * Berbagi CSV lewat share sheet bawaan Android (WhatsApp, Drive, email, dll).
 * Tidak butuh library tambahan, jadi tetap ringan untuk build pertama.
 */
export async function shareCsv(filename: string, csv: string): Promise<void> {
  await Share.share({
    title: filename,
    message: csv,
  });
}
