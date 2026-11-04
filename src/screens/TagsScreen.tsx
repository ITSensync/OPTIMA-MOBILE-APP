import React, { useCallback, useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { Badge } from '../components/Badge';
import { EmptyState } from '../components/EmptyState';
import { Screen } from '../components/Screen';
import { formatEpc } from '../domain/epc';
import { relativeTime } from '../domain/datetime';
import type { TagRecord } from '../domain/types';
import type { RootStackParamList } from '../navigation/types';
import { listTags } from '../storage/tagRepo';
import { colors, fonts, spacing, type } from '../theme';

export function TagsScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [tags, setTags] = useState<TagRecord[]>([]);
  const [query, setQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    const rows = (await listTags()).filter(
      tag => tag.inventoryStatus === 'in_stock' || tag.inventoryStatus === 'outbound',
    );
    setTags(rows);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  const filtered = useMemo(() => {
    const q = query.trim().toUpperCase().replace(/\s+/g, '');
    if (!q) {
      return tags;
    }
    return tags.filter(tag => tag.epc.includes(q));
  }, [tags, query]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  return (
    <Screen padded={false} scroll={false}>
      <View style={styles.header}>
        <Text style={styles.title}>Master Tag</Text>
        <Text style={styles.subtitle}>
          {tags.length} tag terdaftar di perangkat ini
        </Text>
      </View>

      <View style={styles.searchWrap}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Cari EPC…"
          placeholderTextColor={colors.faint}
          autoCapitalize="characters"
          autoCorrect={false}
          style={styles.search}
        />
      </View>

      <FlatList
        data={filtered}
        keyExtractor={item => item.epc}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.accent}
            colors={[colors.accent]}
            progressBackgroundColor={colors.surface}
          />
        }
        ListEmptyComponent={
          <EmptyState
            title={query ? 'Tidak ada tag cocok' : 'Belum ada tag'}
            description={
              query
                ? 'Coba potongan EPC lain.'
                : 'Tag akan terdaftar setelah inbound dikonfirmasi di Inventory.'
            }
          />
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => navigation.navigate('TagDetail', { epc: item.epc })}
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          >
            <View style={styles.rowMain}>
              <Text style={styles.epc} numberOfLines={1}>
                {formatEpc(item.epc)}
              </Text>
              <Text style={styles.rowMeta}>
                {item.inventoryStatus === 'outbound' ? 'Sudah keluar' : item.inventoryStatus === 'in_stock' ? 'Dalam stok' : item.inventoryStatus === 'pending_location' ? 'Menunggu penempatan' : 'Belum diproses inbound'} · {item.room || 'Belum ada ruangan'} / {item.rack || 'Belum ada rak'}
              </Text>
              <Text style={styles.rowMeta}>
                Terakhir terlihat {relativeTime(Date.parse(item.lastSeenAt))}
              </Text>
            </View>
            <Badge label="EPC" variant="neutral" />
          </Pressable>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  title: { ...type.title, color: colors.text },
  subtitle: { ...type.small, color: colors.muted, marginTop: 2 },
  searchWrap: { paddingHorizontal: spacing.lg, marginTop: spacing.lg },
  search: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    color: colors.text,
    fontFamily: fonts.mono,
    fontSize: 14,
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl,
    flexGrow: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    marginBottom: spacing.sm,
  },
  rowPressed: { opacity: 0.7 },
  rowMain: { flex: 1 },
  epc: {
    ...type.small,
    color: colors.text,
    fontFamily: fonts.mono,
    fontWeight: '700',
  },
  rowMeta: {
    ...type.tiny,
    color: colors.faint,
    marginTop: 3,
    textTransform: 'none',
    letterSpacing: 0,
  },
});
