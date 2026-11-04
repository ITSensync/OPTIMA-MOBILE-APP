import React, { useCallback, useState } from 'react';
import {
  Alert,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { KeyValueRow } from '../components/KeyValueRow';
import { Screen } from '../components/Screen';
import { APP_VERSION } from '../config';
import type { ReaderMode } from '../domain/types';
import type { RootStackParamList } from '../navigation/types';
import { useSettings } from '../state/SettingsProvider';
import { inventoryHistoryToCsv, shareCsv } from '../storage/export';
import { clearLogs, flushLogs } from '../storage/logRepo';
import { clearInventoryTransactions, listInventoryTransactions } from '../storage/inventoryRepo';
import { listInventoryHistory } from '../storage/inventoryHistoryRepo';
import { clearInventoryHistory } from '../storage/inventoryHistoryRepo';
import { clearPendingPlacements } from '../storage/pendingPlacementRepo';
import { clearTags, countTags } from '../storage/tagRepo';
import { colors, fonts, radius, spacing, type } from '../theme';

const READER_MODES: Array<{ key: ReaderMode; label: string }> = [
  { key: 'sdk', label: 'UHF internal (EL-UHF-RH02)' },
  { key: 'mock', label: 'Simulasi' },
];

export function SettingsScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { settings, update } = useSettings();
  const [tags, setTags] = useState(0);
  const [reads, setReads] = useState(0);
  const [operator, setOperator] = useState(settings.operator);

  useFocusEffect(
    useCallback(() => {
      setOperator(settings.operator);
      Promise.all([countTags(), listInventoryHistory(), listInventoryTransactions()]).then(([tagCount, registered, transactions]) => {
        setTags(tagCount);
        setReads(registered.length + transactions.length);
      });
    }, [settings.operator]),
  );

  const commitOperator = useCallback(() => {
    if (operator.trim() !== settings.operator) {
      void update({ operator: operator.trim() });
    }
  }, [operator, settings.operator, update]);

  const exportAll = useCallback(async () => {
    const [registered, transactions] = await Promise.all([
      listInventoryHistory(),
      listInventoryTransactions(),
    ]);
    if (registered.length + transactions.length === 0) {
      Alert.alert('Belum ada data', 'Tidak ada riwayat untuk diexport.');
      return;
    }
    const rows = [
      ...registered,
      ...transactions.map(transaction => ({ ...transaction, kind: transaction.operation })),
    ].sort((a, b) => b.atMs - a.atMs);
    await shareCsv('optima-inventory-riwayat.csv', inventoryHistoryToCsv(rows));
  }, []);

  const onClearLogs = useCallback(() => {
    Alert.alert(
      'Hapus semua riwayat?',
      'Master tag tetap disimpan. Tindakan ini tidak bisa dibatalkan.',
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Hapus riwayat',
          style: 'destructive',
          onPress: async () => {
            await clearLogs();
            await clearInventoryTransactions();
            await clearInventoryHistory();
            setReads(0);
          },
        },
      ],
    );
  }, []);

  const onClearAll = useCallback(() => {
    Alert.alert(
      'Hapus semua data?',
      'Master tag DAN riwayat pembacaan akan dihapus dari perangkat ini.',
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Hapus semua',
          style: 'destructive',
          onPress: async () => {
            await clearLogs();
            await clearTags();
            await clearInventoryTransactions();
            await clearInventoryHistory();
            await clearPendingPlacements();
            await flushLogs();
            setReads(0);
            setTags(0);
          },
        },
      ],
    );
  }, []);

  return (
    <Screen scroll>
      <Text style={styles.title}>Pengaturan</Text>
      <Text style={styles.subtitle}>Perilaku pembacaan & data lokal</Text>

      <Card style={styles.card}>
        <Text style={styles.cardTitle}>Operator</Text>
        <Text style={styles.cardHint}>
          Nama petugas yang memakai perangkat ini (opsional).
        </Text>
        <TextInput
          value={operator}
          onChangeText={setOperator}
          onBlur={commitOperator}
          onSubmitEditing={commitOperator}
          placeholder="Nama operator"
          placeholderTextColor={colors.faint}
          style={styles.input}
        />
      </Card>

      <Card style={styles.card}>
        <Text style={styles.cardTitle}>Sumber reader</Text>
        {READER_MODES.map(mode => {
          const active = settings.readerMode === mode.key;
          return (
            <Pressable
              key={mode.key}
              onPress={() => update({ readerMode: mode.key })}
              style={[styles.modeRow, active && styles.modeRowActive]}
            >
              <View style={styles.modeMain}>
                <Text
                  style={[styles.modeLabel, active && styles.modeLabelActive]}
                >
                  {mode.label}
                </Text>
              </View>
              {active ? <Badge label="AKTIF" variant="accent" /> : null}
            </Pressable>
          );
        })}
      </Card>

      <Card style={styles.card}>
        <View style={styles.switchRow}>
          <View style={styles.switchText}>
            <Text style={styles.cardTitle}>Getar saat terbaca</Text>
            <Text style={styles.cardHint}>
              Feedback haptic untuk operator di lapangan.
            </Text>
          </View>
          <Switch
            value={settings.haptics}
            onValueChange={value => update({ haptics: value })}
            trackColor={{ false: colors.border, true: 'rgba(45,212,191,0.5)' }}
            thumbColor={settings.haptics ? colors.accent : colors.faint}
          />
        </View>
      </Card>

      <Card style={styles.card}>
        <Pressable onPress={() => navigation.navigate('PlacementSettings')} style={styles.linkRow}>
          <View>
            <Text style={styles.cardTitle}>Daftar penempatan</Text>
            <Text style={styles.cardHint}>Kelola pilihan ruangan dan rak untuk inbound serta relocation.</Text>
          </View>
          <Text style={styles.chevron}>›</Text>
        </Pressable>
      </Card>

      <Card style={styles.card}>
        <Text style={styles.cardTitle}>Data lokal</Text>
        <KeyValueRow label="Tag terdaftar" value={`${tags}`} />
        <KeyValueRow label="Total riwayat inventory" value={`${reads}`} />
        <KeyValueRow label="Penyimpanan" value="AsyncStorage (per hari)" />
        <Button
          label="Export semua (CSV)"
          variant="secondary"
          onPress={exportAll}
          style={styles.btn}
        />
        <Button
          label="Hapus riwayat"
          variant="ghost"
          onPress={onClearLogs}
          style={styles.btn}
        />
        <Button
          label="Hapus semua data"
          variant="danger"
          onPress={onClearAll}
          style={styles.btn}
        />
      </Card>

      <Card style={styles.card}>
        <Pressable
          onPress={() => navigation.navigate('Diagnostics')}
          style={styles.linkRow}
        >
          <View>
            <Text style={styles.cardTitle}>Diagnostics</Text>
            <Text style={styles.cardHint}>
              Lihat informasi perangkat dan penyimpanan lokal.
            </Text>
          </View>
          <Text style={styles.chevron}>›</Text>
        </Pressable>
      </Card>

      <View style={styles.about}>
        <Text style={styles.aboutText}>OPTIMA RFID v{APP_VERSION}</Text>
        <Text style={styles.aboutText}>
          com.optima.rfid · React Native 0.88
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { ...type.title, color: colors.text },
  subtitle: {
    ...type.small,
    color: colors.muted,
    marginTop: 2,
    marginBottom: spacing.lg,
  },
  card: { marginBottom: spacing.md },
  cardTitle: { ...type.h2, color: colors.text },
  cardHint: {
    ...type.small,
    color: colors.muted,
    lineHeight: 19,
    marginTop: 2,
  },
  input: {
    marginTop: spacing.md,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    color: colors.text,
    fontSize: 15,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  chipText: { ...type.small, color: colors.muted },
  chipTextActive: { color: colors.accent },
  modeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.sm,
  },
  modeRowActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  modeMain: { flex: 1 },
  modeLabel: { ...type.body, color: colors.text, fontWeight: '700' },
  modeLabelActive: { color: colors.accent },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  switchText: { flex: 1 },
  btn: { marginTop: spacing.sm },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  chevron: { fontSize: 26, color: colors.muted, paddingLeft: spacing.md },
  about: { alignItems: 'center', paddingVertical: spacing.xl, gap: 2 },
  aboutText: {
    ...type.tiny,
    color: colors.faint,
    textTransform: 'none',
    letterSpacing: 0,
    fontFamily: fonts.mono,
  },
});
