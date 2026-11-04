import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing, type } from '../theme';

type Props = {
  title: string;
  description?: string;
  children?: React.ReactNode;
};

export function EmptyState({ title, description, children }: Props) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.glyph}>◎</Text>
      <Text style={styles.title}>{title}</Text>
      {description ? (
        <Text style={styles.description}>{description}</Text>
      ) : null}
      {children ? <View style={styles.extra}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.xl,
  },
  glyph: { fontSize: 40, color: colors.faint, marginBottom: spacing.sm },
  title: { ...type.h2, color: colors.text, textAlign: 'center' },
  description: {
    ...type.small,
    color: colors.muted,
    textAlign: 'center',
    marginTop: spacing.xs,
    lineHeight: 19,
  },
  extra: { marginTop: spacing.lg, width: '100%' },
});
