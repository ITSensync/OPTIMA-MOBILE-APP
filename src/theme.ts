import { Platform } from 'react-native';

/**
 * Tema gelap industrial — kontras tinggi supaya terbaca di gudang/lapangan.
 */
export const colors = {
  bg: '#080F1A',
  surface: '#0F1B2D',
  surfaceAlt: '#16253C',
  border: '#22344F',
  text: '#E8F0FA',
  muted: '#8FA3BC',
  faint: '#5C718C',
  accent: '#2DD4BF',
  accentSoft: 'rgba(45, 212, 191, 0.12)',
  new: '#34D399',
  newSoft: 'rgba(52, 211, 153, 0.14)',
  old: '#FBBF24',
  oldSoft: 'rgba(251, 191, 36, 0.14)',
  danger: '#F87171',
  dangerSoft: 'rgba(248, 113, 113, 0.14)',
  white: '#FFFFFF',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 18,
  pill: 999,
};

export const fonts = {
  mono: Platform.select({ android: 'monospace', default: 'Courier' }) as string,
};

export const type = {
  title: { fontSize: 22, fontWeight: '800' as const, letterSpacing: 0.2 },
  h2: { fontSize: 17, fontWeight: '700' as const },
  body: { fontSize: 15, fontWeight: '500' as const },
  small: { fontSize: 13, fontWeight: '500' as const },
  tiny: { fontSize: 11, fontWeight: '600' as const, letterSpacing: 0.6 },
};
