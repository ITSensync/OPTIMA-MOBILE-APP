/**
 * Tipe data inti aplikasi.
 *
 * Catatan desain: sengaja dibuat seminimal mungkin (EPC + waktu + status)
 * sesuai kebutuhan verifikasi pembacaan. `readCount` disimpan karena dipakai
 * untuk membuktikan dedupe bekerja, bukan untuk ditampilkan sebagai data bisnis.
 */

export type TagRecord = {
  /** EPC tag, sudah dinormalisasi (hex uppercase tanpa separator). */
  epc: string;
  /** ISO timestamp pertama kali tag terlihat. */
  firstSeenAt: string;
  /** ISO timestamp terakhir tag terlihat. */
  lastSeenAt: string;
  /** Total berapa kali tag terlihat (termasuk pembacaan yang di-dedupe). */
  readCount: number;
  productName?: string;
  description?: string;
  unit?: 'pcs' | 'gram' | 'liter';
  quantity?: number;
  room?: string;
  rack?: string;
  inventoryStatus?: 'pending_location' | 'in_stock' | 'outbound';
};

/** Kategori setiap kejadian scan. */
export type ReadingStatus = 'new' | 'duplicate';

export type InventoryOperation = 'inbound' | 'outbound' | 'relocation';

export type InventoryLocation = { room: string; rack: string };

export type Placement = InventoryLocation & {
  id: string;
  createdAt: string;
};

export type InventoryTransaction = {
  id: string;
  operation: InventoryOperation;
  at: string;
  atMs: number;
  tags: string[];
  from?: InventoryLocation;
  to?: InventoryLocation;
  locationsByEpc?: Record<string, InventoryLocation>;
};

export type InventoryHistoryKind = 'tag_registered' | InventoryOperation;

export type InventoryHistoryEntry = {
  id: string;
  kind: InventoryHistoryKind;
  at: string;
  atMs: number;
  tags: string[];
  from?: InventoryLocation;
  to?: InventoryLocation;
  locationsByEpc?: Record<string, InventoryLocation>;
};

export type PendingPlacement = {
  epc: string;
  scannedAt: number;
  firstSeenAt?: string;
  readCount?: number;
  productName?: string;
  description?: string;
  unit?: 'pcs' | 'gram' | 'liter';
  quantity?: string;
  room?: string;
  rack?: string;
};

export type Reading = {
  id: string;
  epc: string;
  /** ISO timestamp pembacaan. */
  at: string;
  /** Epoch ms, dipakai untuk sorting & nama chunk harian. */
  atMs: number;
  /** Status kejadian scan: tag asli, pembacaan lama, atau duplikat. */
  status?: ReadingStatus;
  /** Kompatibilitas riwayat versi lama yang belum memiliki `status`. */
  isNew?: boolean;
  /** Hitungan ke-berapa tag ini dibaca. */
  readCount: number;
};

export type ReaderMode = 'mock' | 'sdk';

export type Settings = {
  /** Nama petugas/operator yang sedang memakai perangkat. */
  operator: string;
  /** Getar saat tag terbaca. */
  haptics: boolean;
  /** Sumber data reader yang aktif. */
  readerMode: ReaderMode;
};

export type ScanOutcome = {
  tag: TagRecord;
  /** Setiap scan disimpan, termasuk duplikat. */
  reading: Reading;
  duplicate: boolean;
};

export type DayStats = {
  reads: number;
  newTags: number;
  duplicates: number;
};
