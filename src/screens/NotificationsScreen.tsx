import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { Badge } from '../components/Badge';
import { EmptyState } from '../components/EmptyState';
import { Screen } from '../components/Screen';
import { formatEpc } from '../domain/epc';
import { missingProductFields } from '../domain/product';
import type { PendingPlacement } from '../domain/types';
import type { RootStackParamList } from '../navigation/types';
import { listPendingPlacements } from '../storage/pendingPlacementRepo';
import { colors, fonts, radius, spacing, type } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Notifications'>;

export function NotificationsScreen({ navigation }: Props) {
  const [pending, setPending] = useState<PendingPlacement[]>([]);
  const [now, setNow] = useState(Date.now());

  const refresh = useCallback(async () => {
    setPending(await listPendingPlacements());
  }, []);

  const incomplete = pending.filter(item => missingProductFields(item).length > 0);
  const overdue = incomplete.filter(item => now - item.scannedAt >= 60_000);

  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));
  useEffect(() => {
    const nextDueAt = incomplete
      .map(item => item.scannedAt + 60_000)
      .filter(at => at > now)
      .sort((a, b) => a - b)[0];
    if (nextDueAt === undefined) return;
    const timer = setTimeout(() => setNow(Date.now()), Math.max(0, nextDueAt - Date.now()));
    return () => clearTimeout(timer);
  }, [now, incomplete]);

  return (
    <Screen scroll>
      <Text style={styles.title}>Notifikasi kelengkapan data</Text>
      <Text style={styles.subtitle}>
        Tag dengan data produk atau penempatan yang belum lengkap.
      </Text>
      {overdue.length === 0 ? (
        <EmptyState title="Tidak ada kelengkapan tertunda" description="Data produk dan penempatan tag sudah lengkap." />
      ) : overdue.map(item => {
        const elapsedMs = Math.max(0, now - item.scannedAt);
        const elapsed = `${Math.floor(elapsedMs / 60_000)} menit sejak scan`;
        return (
          <Pressable key={item.epc}
            onPress={() => navigation.navigate('PendingPlacement', { epc: item.epc })}
            style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
            <View style={styles.cardTop}>
              <Badge label="DATA BELUM LENGKAP" variant="old" />
              <Text style={styles.elapsed}>{elapsed}</Text>
            </View>
            <Text style={styles.epc}>{formatEpc(item.epc)}</Text>
            <Text style={styles.location}>Belum lengkap: {missingProductFields(item).join(', ')}</Text>
            <Text style={styles.location}>Ruangan: {item.room || 'Belum diisi'} · Rak: {item.rack || 'Belum diisi'}</Text>
            {item.productName ? <Text style={styles.location}>Barang: {item.productName}</Text> : null}
            <Text style={styles.action}>Lengkapi data produk & penempatan ›</Text>
          </Pressable>
        );
      })}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { ...type.title, color: colors.text },
  subtitle: { ...type.small, color: colors.muted, marginTop: 3, marginBottom: spacing.md },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm },
  pressed: { opacity: 0.72 },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.xs },
  elapsed: { ...type.tiny, color: colors.muted, textTransform: 'none', letterSpacing: 0 },
  epc: { ...type.small, color: colors.text, fontFamily: fonts.mono, marginTop: spacing.md },
  location: { ...type.tiny, color: colors.muted, marginTop: spacing.xs, textTransform: 'none', letterSpacing: 0 },
  action: { ...type.small, color: colors.accent, fontWeight: '700', marginTop: spacing.md },
});
