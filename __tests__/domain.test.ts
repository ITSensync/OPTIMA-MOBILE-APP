import { describeEpc, formatEpc, normalizeEpc } from '../src/domain/epc';
import {
  classifyReading,
  getReadingStatus,
  makeReading,
  summarize,
} from '../src/domain/reading';
import { dayKeyOf, localDateTime } from '../src/domain/datetime';
import { readingsToCsv } from '../src/storage/export';
import type { TagRecord } from '../src/domain/types';
import { isProductComplete, missingProductFields, parseQuantity, PRODUCT_UNITS } from '../src/domain/product';

const EPC = 'E28011700000000000000001';

describe('normalizeEpc', () => {
  it('membersihkan spasi, separator, dan uppercase', () => {
    expect(normalizeEpc('e280 1170 0000 0000 0000 0001')).toBe(EPC);
    expect(normalizeEpc('E2:80:11:70:00:00:00:00:00:00:00:01')).toBe(EPC);
    expect(normalizeEpc('  E28011700000000000000001\r\n')).toBe(EPC);
    expect(normalizeEpc('E280-1170-0000-0000-0000-0001')).toBe(EPC);
    expect(normalizeEpc('0xE28011700000000000000001')).toBe(EPC);
  });

  it('menolak nilai yang bukan hex atau panjang tidak wajar', () => {
    expect(normalizeEpc('')).toBeNull();
    expect(normalizeEpc(null)).toBeNull();
    expect(normalizeEpc('ZZZZZZZZ')).toBeNull();
    expect(normalizeEpc('E280117')).toBeNull(); // ganjil
    expect(normalizeEpc('E2801170')).not.toBeNull(); // 8 hex = 32-bit
    expect(normalizeEpc('E2'.repeat(20))).toBeNull(); // 40 hex terlalu panjang
  });
});

describe('data produk inventory', () => {
  it('menerima jumlah desimal dengan titik atau koma dan menolak nilai invalid', () => {
    expect(parseQuantity('1.25')).toBe(1.25);
    expect(parseQuantity('0,5')).toBe(0.5);
    expect(parseQuantity('0')).toBeNull();
    expect(parseQuantity('-2')).toBeNull();
    expect(parseQuantity('abc')).toBeNull();
  });

  it('membatasi satuan dan mengecek semua data produk wajib', () => {
    expect(PRODUCT_UNITS).toEqual(['pcs', 'gram', 'liter']);
    const product = {
      productName: 'Susu UHT',
      description: 'Susu full cream',
      unit: 'liter',
      quantity: '1.5',
      room: 'Gudang A',
      rack: 'Rak 01',
    };
    expect(isProductComplete(product)).toBe(true);
    expect(missingProductFields({ ...product, description: '', quantity: '' })).toEqual([
      'deskripsi',
      'jumlah',
    ]);
  });
});

describe('formatEpc', () => {
  it('mengelompokkan per 4 karakter', () => {
    expect(formatEpc(EPC)).toBe('E280 1170 0000 0000 0000 0001');
    expect(formatEpc('E2801170', 2)).toBe('E2 80 11 70');
  });
});

describe('describeEpc', () => {
  it('melaporkan panjang bit untuk EPC valid', () => {
    expect(describeEpc(EPC)).toBe('24 hex / 96-bit');
    expect(describeEpc('bukan epc')).toContain('bukan EPC yang valid');
  });
});

describe('classifyReading', () => {
  const now = Date.parse('2026-11-02T10:00:00.000Z');

  it('menandai tag baru saat belum ada data', () => {
    const result = classifyReading(EPC, null, now);
    expect(result.isNew).toBe(true);
    expect(result.duplicate).toBe(false);
    expect(result.status).toBe('new');
    expect(result.next.readCount).toBe(1);
  });

  it('menandai duplikat bila masih dalam jendela waktu', () => {
    const existing: TagRecord = {
      epc: EPC,
      firstSeenAt: new Date(now - 10_000).toISOString(),
      lastSeenAt: new Date(now - 1000).toISOString(),
      readCount: 4,
    };
    const result = classifyReading(EPC, existing, now);
    expect(result.isNew).toBe(false);
    expect(result.duplicate).toBe(true);
    expect(result.status).toBe('duplicate');
    expect(result.next.readCount).toBe(5);
  });

  it('menandai pembacaan tag terdaftar sebagai duplikat tanpa batas waktu', () => {
    const existing: TagRecord = {
      epc: EPC,
      firstSeenAt: new Date(now - 60_000).toISOString(),
      lastSeenAt: new Date(now - 4000).toISOString(),
      readCount: 2,
    };
    const result = classifyReading(EPC, existing, now);
    expect(result.duplicate).toBe(true);
    expect(result.isNew).toBe(false);
    expect(result.status).toBe('duplicate');
    expect(result.next.readCount).toBe(3);
  });
});

describe('makeReading & summarize', () => {
  it('membuat id unik dan menghitung ringkasan', () => {
    const a = makeReading(EPC, 1_700_000_000_000, 'new', 1);
    const b = makeReading(EPC, 1_700_000_001_000, 'duplicate', 2);
    expect(a.id).not.toBe(b.id);
    expect(summarize([a, b])).toEqual({
      reads: 2,
      newTags: 1,
      duplicates: 1,
    });
    expect(getReadingStatus({ isNew: true })).toBe('new');
  });
});

describe('datetime', () => {
  it('membuat kunci hari lokal', () => {
    const ms = new Date(2026, 10, 2, 23, 30).getTime();
    expect(dayKeyOf(ms)).toBe('2026-11-02');
  });

  it('memformat tanggal lokal bahasa Indonesia', () => {
    const ms = new Date(2026, 10, 2, 9, 5, 7).getTime();
    expect(localDateTime(new Date(ms).toISOString())).toBe(
      '2 Nov 2026 09:05:07',
    );
  });
});

describe('readingsToCsv', () => {
  it('menulis header dan baris sesuai status', () => {
    const row = makeReading(
      EPC,
      new Date(2026, 10, 2, 9, 5, 7).getTime(),
      'new',
      1,
    );
    const csv = readingsToCsv([row]);
    const [header, line] = csv.split('\n');
    expect(header).toBe('epc,waktu_iso,waktu_lokal,status,read_count');
    expect(line).toContain(EPC);
    expect(line).toContain('BARU');
    expect(line).toContain(',1');
  });
});
