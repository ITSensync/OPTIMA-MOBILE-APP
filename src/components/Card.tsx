import React from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { colors, radius, spacing } from '../theme';

type Props = {
  children: React.ReactNode;
  style?: ViewStyle;
  tone?: 'default' | 'accent' | 'danger';
};

export function Card({ children, style, tone = 'default' }: Props) {
  return (
    <View
      style={[
        styles.card,
        tone === 'accent' && styles.accent,
        tone === 'danger' && styles.danger,
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  accent: {
    borderColor: 'rgba(45, 212, 191, 0.45)',
    backgroundColor: colors.surfaceAlt,
  },
  danger: {
    borderColor: 'rgba(248, 113, 113, 0.5)',
    backgroundColor: colors.surface,
  },
});
