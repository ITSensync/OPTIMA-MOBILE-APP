/**
 * Utilitas EPC (Electronic Product Code).
 *
 * Reader UHF bisa mengirim EPC dalam beberapa bentuk:
 *  - "E2801170 0000 0000 0000 0001"  (dengan spasi)
 *  - "e2801170000000000000001\r\n"    (dengan CRLF sebagai suffix)
 *  - "E2:80:11:70:..."                (dengan separator)
 * Semua bentuk di atas harus menghasilkan EPC yang sama agar dianggap tag yang sama.
 */

const SEPARATORS = /[\s\r\n\t:;,.|\\/_#-]+/g;
const HEX_ONLY = /^[0-9A-F]+$/;

/**
 * Normalisasi input mentah menjadi EPC kanonik, atau null bila tidak valid.
 *
 * Aturan: hanya hex, panjang genap antara 8-32 karakter (32-128 bit).
 * Rentang ini menampung EPC 96-bit (24 hex), EPC 64-bit (16 hex),
 * TID 24/32 hex, dan format pendek lain yang umum di reader murah.
 */
export function normalizeEpc(raw: string | null | undefined): string | null {
  if (!raw) {
    return null;
  }

  const cleaned = raw
    .normalize('NFKC')
    .replace(SEPARATORS, '')
    .toUpperCase()
    .replace(/^0X/, '');

  if (cleaned.length < 8 || cleaned.length > 32) {
    return null;
  }
  if (cleaned.length % 2 !== 0) {
    return null;
  }
  if (!HEX_ONLY.test(cleaned)) {
    return null;
  }

  return cleaned;
}

/** Kelompokkan EPC supaya mudah dibaca: "E280 1170 0000". */
export function formatEpc(epc: string, groupSize = 4): string {
  if (!epc) {
    return '';
  }
  const chunks: string[] = [];
  for (let i = 0; i < epc.length; i += groupSize) {
    chunks.push(epc.slice(i, i + groupSize));
  }
  return chunks.join(' ');
}

/** Deskripsi teknis singkat untuk kebutuhan validasi EPC. */
export function describeEpc(raw: string): string {
  const cleaned = (raw ?? '').trim();
  const epc = normalizeEpc(cleaned);
  if (!epc) {
    return `${cleaned.length} karakter mentah, bukan EPC yang valid`;
  }
  return `${epc.length} hex / ${epc.length * 4}-bit`;
}
