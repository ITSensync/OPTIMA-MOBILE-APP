import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Platform,
  StyleSheet,
  Text,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { KeyValueRow } from '../components/KeyValueRow';
import { Screen } from '../components/Screen';
import { APP_VERSION } from '../config';
import { clearLogs } from '../storage/logRepo';
import { clearInventoryTransactions, listInventoryTransactions } from '../storage/inventoryRepo';
import { clearInventoryHistory, listInventoryHistory } from '../storage/inventoryHistoryRepo';
import { clearPendingPlacements } from '../storage/pendingPlacementRepo';
import { clearTags, countTags } from '../storage/tagRepo';
import { colors, spacing, type } from '../theme';

export function DiagnosticsScreen() {
  const [stats, setStats] = useState({ tags: 0, reads: 0, keys: 0, bytes: 0 });

  const loadStats = useCallback(async () => {
    const [tagCount, registered, transactions, keys] = await Promise.all([
      countTags(),
      listInventoryHistory(),
      listInventoryTransactions(),
      AsyncStorage.getAllKeys(),
    ]);
    const optimaKeys = keys.filter(key => key.startsWith('optima:'));
    let bytes = 0;
    if (optimaKeys.length > 0) {
      const pairs = await AsyncStorage.multiGet(optimaKeys);
      for (const [, value] of pairs) {
        bytes += value ? value.length : 0;
      }
    }
    setStats({
      tags: tagCount,
      reads: registered.length + transactions.length,
      keys: optimaKeys.length,
      bytes,
    });
  }, []);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  const clearDevelopmentData = useCallback(() => {
    Alert.alert(
      'Bersihkan data development?',
      'Semua master tag dan riwayat scan pada perangkat ini akan dihapus.',
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Bersihkan data',
          style: 'destructive',
          onPress: async () => {
            await clearLogs();
            await clearTags();
            await clearInventoryTransactions();
            await clearInventoryHistory();
            await clearPendingPlacements();
            await loadStats();
          },
        },
      ],
    );
  }, [loadStats]);

  return (
    <Screen scroll>
      <Card>
        <Text style={styles.cardTitle}>Informasi perangkat</Text>
        <KeyValueRow label="Aplikasi" value={`OPTIMA RFID v${APP_VERSION}`} />
        <KeyValueRow
          label="Platform"
          value={`${Platform.OS} ${Platform.Version}`}
        />
      </Card>

      <Card style={styles.card}>
        <Text style={styles.cardTitle}>Penyimpanan lokal</Text>
        <KeyValueRow label="Key AsyncStorage" value={`${stats.keys}`} />
        <KeyValueRow
          label="Ukuran data"
          value={`${(stats.bytes / 1024).toFixed(1)} KB`}
        />
        <KeyValueRow label="Tag terdaftar" value={`${stats.tags}`} />
        <KeyValueRow label="Total riwayat inventory" value={`${stats.reads}`} />
        <Button
          label="Muat ulang"
          variant="secondary"
          onPress={loadStats}
          style={styles.btn}
        />
        <Button
          label="Bersihkan data development"
          variant="danger"
          onPress={clearDevelopmentData}
          style={styles.btn}
        />
      </Card>

      <Card style={styles.card}>
        <Text style={styles.cardTitle}>Panduan reader UHF</Text>
        <Text style={styles.hint}>
          1. Pastikan Inventory menampilkan UHF INTERNAL.{'\n'}
          2. Mulai atau hentikan scan dari tombol UI atau tombol fisik handheld.{'\n'}
          3. Pastikan status reader berubah saat scan dimulai dan dihentikan.
        </Text>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { marginTop: spacing.md },
  cardTitle: { ...type.h2, color: colors.text },
  hint: { ...type.small, color: colors.muted, lineHeight: 19, marginTop: 2 },
  btn: { marginTop: spacing.md },
});
