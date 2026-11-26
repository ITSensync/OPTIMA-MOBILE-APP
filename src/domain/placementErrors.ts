import {
  PlacementApiError,
  PlacementTimeoutError,
  type PreviewItem,
} from '../api/placementApi';

export const BUSINESS_MESSAGES: Record<string, string> = {
  RFID_NOT_REGISTERED: 'RFID belum didaftarkan Admin.',
  PACK_PLAN_NOT_FOUND: 'RFID belum memiliki pack plan.',
  RFID_ADMIN_NOT_READY: 'RFID belum didaftarkan Admin. Pastikan assignment, cetak label, dan penyelesaian PO sudah lengkap.',
  RFID_ALREADY_PLACED: 'Barang sudah pernah ditempatkan.',
  RFID_NOT_PLACED: 'RFID belum berada di rak sehingga tidak dapat direlokasi.',
  RFID_ACTION_ALREADY_COMPLETED: 'RFID sudah outbound atau trash.',
  RFID_LOCATION_NOT_FOUND: 'Lokasi aktif RFID tidak ditemukan.',
  RFID_NOT_IN_SNAPSHOT: 'RFID belum ada saat sesi opname dibuat. Gunakan sesi opname baru.',
  DUPLICATE_IN_SESSION: 'RFID sudah pernah terbaca pada sesi opname ini.',
  RFID_DUPLICATE_IN_SESSION: 'RFID sudah pernah digunakan pada sesi opname ini.',
  SAME_RACK: 'Rak tujuan sama dengan rak asal.',
  RFID_ALREADY_REGISTERED: 'RFID sudah terdaftar. Gunakan assignment/reuse.',
  RFID_REUSE_NOT_RELEASED: 'Siklus RFID sebelumnya belum selesai.',
  PACK_PLAN_CANCELLED: 'Pack plan sudah dibatalkan.',
  RACK_NOT_FOUND: 'Rak tidak ditemukan.',
  RACK_INACTIVE: 'Rak sudah tidak aktif. Muat ulang daftar rak.',
  DUPLICATE_RFID: 'RFID muncul lebih dari satu kali.',
  duplicate_in_request: 'RFID muncul lebih dari satu kali.',
  IDEMPOTENCY_KEY_REUSED: 'Request ini sudah dipakai untuk data berbeda.',
  PLACEMENT_CONFLICT: 'Barang sedang diproses oleh request lain.',
};

export function previewItemMessage(item: PreviewItem): string | undefined {
  return BUSINESS_MESSAGES[item.error_code ?? ''] ?? item.message;
}

export function errorMessage(error: unknown, fallback = 'Placement gagal diproses.'): string {
  if (error instanceof PlacementApiError) {
    const firstError = error.body.errors?.[0];
    return (
      BUSINESS_MESSAGES[firstError?.code ?? ''] ??
      firstError?.message ??
      error.body.message ??
      fallback
    );
  }
  if (error instanceof PlacementTimeoutError) {
    return 'Server belum memberikan jawaban. Anda dapat mencoba lagi dengan request ID yang sama.';
  }
  return error instanceof Error ? error.message : 'Terjadi kesalahan. Coba lagi.';
}
