import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, type } from '../theme';

type Variant = 'new' | 'old' | 'neutral' | 'danger' | 'accent';

type Props = {
  label: string;
  variant?: Variant;
};

const palette: Record<Variant, { bg: string; fg: string; border: string }> = {
  new: { bg: colors.newSoft, fg: colors.new, border: 'rgba(52,211,153,0.4)' },
  old: { bg: colors.oldSoft, fg: colors.old, border: 'rgba(251,191,36,0.4)' },
  neutral: { bg: colors.surfaceAlt, fg: colors.muted, border: colors.border },
  danger: {
    bg: colors.dangerSoft,
    fg: colors.danger,
    border: 'rgba(248,113,113,0.4)',
  },
  accent: {
    bg: colors.accentSoft,
    fg: colors.accent,
    border: 'rgba(45,212,191,0.4)',
  },
};

export function Badge({ label, variant = 'neutral' }: Props) {
  const p = palette[variant];
  return (
    <View
      style={[styles.base, { backgroundColor: p.bg, borderColor: p.border }]}
    >
      <Text style={[styles.text, { color: p.fg }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 4,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  text: { ...type.tiny },
});
