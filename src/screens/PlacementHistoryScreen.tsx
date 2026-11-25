import React, { useCallback, useRef, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

import { fetchPlacementHistory, type HistoryItem } from '../api/placementApi';
import { Button } from '../components/Button';
import { EmptyState } from '../components/EmptyState';
import { groupPlacementHistory, movementLabel, placementStatusLabel, type PlacementHistoryGroup } from '../domain/placement';
import { localDateTime } from '../domain/datetime';
import { colors, fonts, radius, spacing, type } from '../theme';

export function PlacementHistoryScreen() {
  const [groups, setGroups] = useState<PlacementHistoryGroup[]>([]);
  const [error, setError] = useState<string>();
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const groupsRef = useRef<PlacementHistoryGroup[]>([]);

  const load = useCallback(async (append = false) => {
    if (append) setLoadingMore(true);
    else setRefreshing(true);
    try {
      const offset = append ? groupsRef.current.reduce((count, group) => count + group.total, 0) : 0;
      const result = await fetchPlacementHistory(20, offset);
      const nextItems: HistoryItem[] = append
        ? groupsRef.current.flatMap(group => group.items).concat(result.items)
        : result.items;
      const nextGroups = groupPlacementHistory(nextItems);
      groupsRef.current = nextGroups;
      setGroups(nextGroups);
      setHasMore(offset + result.items.length < result.total);
      setError(undefined);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Riwayat gagal dimuat.');
    } finally {
      setRefreshing(false);
      setLoadingMore(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const onRefresh = useCallback(() => { void load(); }, [load]);
  const loadMore = useCallback(() => {
    if (!loadingMore && hasMore) void load(true);
  }, [hasMore, load, loadingMore]);

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.title}>History aktivitas</Text>
        <Text style={styles.subtitle}>Ringkasan placement dan relocation dari backend.</Text>
      </View>
      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
          <Button label="Coba lagi" compact onPress={onRefresh} style={styles.retry} />
        </View>
      ) : null}
      <FlatList
        data={groups}
        keyExtractor={item => item.key}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} colors={[colors.accent]} progressBackgroundColor={colors.surface} />}
        ListEmptyComponent={!refreshing ? <EmptyState title="Belum ada history" description="Placement yang berhasil akan tampil di sini." /> : undefined}
        ListFooterComponent={hasMore ? <Button label={loadingMore ? 'Memuat…' : 'Muat lebih banyak'} compact onPress={loadMore} loading={loadingMore} style={styles.moreButton} /> : undefined}
        renderItem={({ item }) => <HistoryRow group={item} />}
      />
    </View>
  );
}

function HistoryRow({ group }: { group: PlacementHistoryGroup }) {
  const rack = group.rack ? `${group.rack.code}${group.rack.name ? ` · ${group.rack.name}` : ''}` : 'Rak tidak tersedia';
  const fromRacks = group.fromRacks.map(item => `${item.code}${item.name ? ` · ${item.name}` : ''}`).join(', ');
  const statuses = group.statuses.map(placementStatusLabel).join(', ');
  return (
    <View style={styles.row}>
      <Text style={styles.action}>{movementLabel(group.movementType)}</Text>
      <Text style={styles.meta}>{localDateTime(group.createdAt)}</Text>
      <Text style={styles.summary}>{group.total} barang · {group.movementType.toLowerCase() === 'relocation' && fromRacks ? `${fromRacks} → ${rack}` : rack}</Text>
      {statuses ? <Text style={styles.meta}>Status: {statuses}</Text> : null}
      {group.items.slice(0, 3).map(item => (
        <Text key={`${item.id ?? item.rfid_number ?? item.item?.rfid_number ?? ''}-${item.created_at}`} style={styles.rfid}>
          {item.rfid_number ?? item.item?.rfid_number ?? 'RFID tidak tersedia'}
        </Text>
      ))}
      {group.items.length > 3 ? <Text style={styles.meta}>+{group.items.length - 3} RFID lainnya</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  title: { ...type.title, color: colors.text },
  subtitle: { ...type.small, color: colors.muted, marginTop: spacing.xs },
  listContent: { paddingHorizontal: spacing.lg, paddingVertical: spacing.lg, paddingBottom: spacing.xxl, flexGrow: 1 },
  row: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm },
  action: { ...type.tiny, color: colors.accent, fontWeight: '700', textTransform: 'none', letterSpacing: 0 },
  meta: { ...type.tiny, color: colors.muted, marginTop: spacing.xs, textTransform: 'none', letterSpacing: 0 },
  summary: { ...type.small, color: colors.text, marginTop: spacing.sm },
  rfid: { ...type.tiny, color: colors.text, fontFamily: fonts.mono, marginTop: 5, textTransform: 'none', letterSpacing: 0 },
  errorBox: { marginHorizontal: spacing.lg, marginTop: spacing.md, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.dangerSoft, borderWidth: 1, borderColor: colors.danger },
  errorText: { ...type.small, color: colors.text, lineHeight: 19 },
  retry: { marginTop: spacing.sm, alignSelf: 'flex-start' },
  moreButton: { marginTop: spacing.sm },
});
