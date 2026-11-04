const MONTHS_ID = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'Mei',
  'Jun',
  'Jul',
  'Agu',
  'Sep',
  'Okt',
  'Nov',
  'Des',
];

function pad(value: number, length = 2): string {
  return `${value}`.padStart(length, '0');
}

/** Kunci harian berbasis waktu lokal: "2026-11-02". */
export function dayKeyOf(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function timeOf(ms: number): string {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function localDateTime(iso: string): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) {
    return iso;
  }
  const d = new Date(ms);
  return `${d.getDate()} ${MONTHS_ID[d.getMonth()]} ${d.getFullYear()} ${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** Label ramah untuk chip tanggal: "02 Nov 2026". */
export function dayLabel(day: string): string {
  const [year, month, date] = day.split('-').map(Number);
  if (!year || !month || !date) {
    return day;
  }
  return `${pad(date)} ${MONTHS_ID[month - 1]} ${year}`;
}

export function relativeTime(ms: number, nowMs = Date.now()): string {
  const diff = Math.max(0, nowMs - ms);
  const seconds = Math.floor(diff / 1000);
  if (seconds < 5) {
    return 'baru saja';
  }
  if (seconds < 60) {
    return `${seconds} detik lalu`;
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes} menit lalu`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours} jam lalu`;
  }
  const days = Math.floor(hours / 24);
  return `${days} hari lalu`;
}
