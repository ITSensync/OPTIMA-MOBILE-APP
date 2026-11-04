import React, { useCallback, useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

import { EmptyState } from '../components/EmptyState';
import { dayKeyOf, dayLabel, localDateTime } from '../domain/datetime';
import { formatEpc } from '../domain/epc';
import type { InventoryHistoryEntry, InventoryTransaction } from '../domain/types';
import { listInventoryTransactions } from '../storage/inventoryRepo';
import { listInventoryHistory } from '../storage/inventoryHistoryRepo';
import { colors, fonts, radius, spacing, type } from '../theme';

type Filter = 'all' | 'tag_registered' | 'inbound' | 'relocation' | 'outbound';
const FILTERS: Array<{ key: Filter; label: string }> = [
  { key: 'all', label: 'Semua' },
  { key: 'tag_registered', label: 'Tag baru' },
  { key: 'inbound', label: 'Inbound' },
  { key: 'relocation', label: 'Relocation' },
  { key: 'outbound', label: 'Outbound' },
];

export function HistoryScreen() {
  const [entries, setEntries] = useState<InventoryHistoryEntry[]>([]);
  const [days, setDays] = useState<string[]>([]);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [tagQuery, setTagQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const [registered, transactions] = await Promise.all([
      listInventoryHistory(),
      listInventoryTransactions(),
    ]);
    const rows: InventoryHistoryEntry[] = [
      ...registered,
      ...transactions.map((transaction: InventoryTransaction) => ({
        ...transaction,
        kind: transaction.operation,
      })),
    ].sort((a, b) => b.atMs - a.atMs);
    const availableDays = [...new Set(rows.map(row => dayKeyOf(row.atMs)))].sort(
      (a, b) => b.localeCompare(a),
    );
    setEntries(rows);
    setDays(availableDays);
    setSelectedDay(current => current && availableDays.includes(current)
      ? current
      : availableDays[0] ?? null);
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const filtered = useMemo(() => {
    const query = tagQuery.trim().toUpperCase().replace(/\s+/g, '');
    return entries.filter(entry =>
      (!selectedDay || dayKeyOf(entry.atMs) === selectedDay) &&
      (filter === 'all' || entry.kind === filter) &&
      (!query || entry.tags.some(epc => epc.includes(query))),
    );
  }, [entries, filter, selectedDay, tagQuery]);

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.title}>Riwayat inventory</Text>
        <Text style={styles.subtitle}>Tag baru terdaftar dan transaksi inventory.</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
        {days.length === 0 ? <Text style={styles.noDays}>Belum ada riwayat.</Text> : days.map(day => {
          const active = day === selectedDay;
          return (
            <Pressable key={day} onPress={() => setSelectedDay(day)} style={[styles.chip, active && styles.chipActive]}>
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{dayLabel(day)}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <View style={styles.filterRow}>
        {FILTERS.map(item => {
          const active = filter === item.key;
          return (
            <Pressable key={item.key} onPress={() => setFilter(item.key)} style={[styles.chip, active && styles.chipActive]}>
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{item.label}</Text>
            </Pressable>
          );
        })}
      </View>
      <TextInput
        value={tagQuery}
        onChangeText={setTagQuery}
        placeholder="Cari / filter berdasarkan EPC tag"
        placeholderTextColor={colors.faint}
        autoCapitalize="characters"
        autoCorrect={false}
        style={styles.search}
      />
      <Text style={styles.resultCount}>{filtered.length} riwayat</Text>
      <FlatList
        data={filtered}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} colors={[colors.accent]} progressBackgroundColor={colors.surface} />}
        ListEmptyComponent={<EmptyState title="Belum ada riwayat" description="Pilih tanggal atau filter lain, atau proses transaksi inventory." />}
        renderItem={({ item }) => <HistoryRow entry={item} />}
      />
    </View>
  );
}

function HistoryRow({ entry }: { entry: InventoryHistoryEntry }) {
  const title = entry.kind === 'tag_registered'
    ? 'TAG BARU TERDAFTAR'
    : entry.kind.toUpperCase();
  return (
    <View style={styles.row}>
      <Text style={styles.operation}>{title}</Text>
      <Text style={styles.meta}>{localDateTime(entry.at)}</Text>
      {entry.kind === 'tag_registered' ? (
        <Text style={styles.meta}>Tag baru didaftarkan setelah inbound dikonfirmasi.</Text>
      ) : (
        <Text style={styles.meta}>{entry.tags.length} tag · {entry.kind === 'inbound' ? 'Barang masuk' : entry.kind === 'outbound' ? 'Barang keluar' : 'Perpindahan lokasi'}</Text>
      )}
      {entry.from ? <Text style={styles.meta}>Dari: {entry.from.room} / {entry.from.rack}</Text> : null}
      {entry.to ? <Text style={styles.meta}>Tujuan: {entry.to.room} / {entry.to.rack}</Text> : null}
      {!entry.to && entry.locationsByEpc ? Object.entries(entry.locationsByEpc).map(([epc, location]) => (
        <Text key={epc} style={styles.meta}>{formatEpc(epc)} · {location.room} / {location.rack}</Text>
      )) : null}
      {entry.tags.map(epc => <Text key={epc} style={styles.epc}>{formatEpc(epc)}</Text>)}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, paddingTop: spacing.md },
  header: { paddingHorizontal: spacing.lg },
  title: { ...type.title, color: colors.text },
  subtitle: { ...type.small, color: colors.muted, marginTop: 2 },
  chipsRow: { paddingHorizontal: spacing.lg, gap: spacing.sm, paddingVertical: spacing.md },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  chip: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  chipActive: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
  chipText: { ...type.tiny, color: colors.muted, textTransform: 'none', letterSpacing: 0 },
  chipTextActive: { color: colors.accent },
  noDays: { ...type.small, color: colors.faint },
  search: { marginHorizontal: spacing.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: spacing.md, paddingVertical: spacing.md, color: colors.text, fontFamily: fonts.mono, fontSize: 13 },
  resultCount: { ...type.tiny, color: colors.muted, paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  listContent: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md, paddingBottom: spacing.xxl, flexGrow: 1 },
  row: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: spacing.md, marginBottom: spacing.sm },
  operation: { ...type.tiny, color: colors.accent, fontWeight: '700' },
  meta: { ...type.tiny, color: colors.muted, marginTop: 4, textTransform: 'none', letterSpacing: 0 },
  epc: { ...type.tiny, color: colors.text, fontFamily: fonts.mono, marginTop: 5 },
});
