import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  useFocusEffect,
  useIsFocused,
  useNavigation,
} from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { EmptyState } from '../components/EmptyState';
import { PlacementPicker } from '../components/PlacementPicker';
import { Screen } from '../components/Screen';
import { formatEpc, normalizeEpc } from '../domain/epc';
import { isProductComplete, missingProductFields, parseQuantity, PRODUCT_UNITS, type ProductUnit } from '../domain/product';
import type { InventoryOperation, Placement } from '../domain/types';
import type { RootStackParamList } from '../navigation/types';
import { useUhfReader } from '../reader/useUhfReader';
import { useSettings } from '../state/SettingsProvider';
import { playScanFeedback } from '../reader/scanFeedback';
import {
  commitInventoryOperation,
  registerInboundScan,
} from '../storage/inventoryRepo';
import {
  listPendingPlacements,
  removePendingPlacements,
  reconcilePendingPlacements,
  updatePendingPlacementDrafts,
} from '../storage/pendingPlacementRepo';
import { getTag } from '../storage/tagRepo';
import { listPlacements } from '../storage/placementRepo';
import { colors, fonts, radius, spacing, type } from '../theme';

type ScannedItem = {
  epc: string;
  atMs: number;
  productName?: string;
  description?: string;
  unit?: ProductUnit;
  quantity?: string;
  room?: string;
  rack?: string;
};

const OPERATIONS: Array<{ key: InventoryOperation; label: string }> = [
  { key: 'inbound', label: 'Inbound' },
  { key: 'outbound', label: 'Outbound' },
  { key: 'relocation', label: 'Relocation' },
];

export function InventoryScreen() {
  const focused = useIsFocused();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { settings } = useSettings();
  const [operation, setOperation] = useState<InventoryOperation>('inbound');
  const [items, setItems] = useState<ScannedItem[]>([]);
  const [room, setRoom] = useState('');
  const [rack, setRack] = useState('');
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [pendingRows, setPendingRows] = useState<
    Awaited<ReturnType<typeof listPendingPlacements>>
  >([]);
  const [placements, setPlacements] = useState<Placement[]>([]);
  const [selectedPlacementId, setSelectedPlacementId] = useState<string>();
  const [bulkPlacementId, setBulkPlacementId] = useState<string>();
  const [bulkLocation, setBulkLocation] = useState<{ room: string; rack: string }>();
  const seenEpcs = useRef(new Set<string>());

  useEffect(() => {
    const nextDueAt = pendingRows
      .map(item => item.scannedAt + 60_000)
      .filter(at => at > now)
      .sort((a, b) => a - b)[0];
    if (nextDueAt === undefined) return;
    const timer = setTimeout(
      () => setNow(Date.now()),
      Math.max(0, nextDueAt - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [now, pendingRows]);

  const refreshPending = useCallback(async () => {
    setPendingRows(await listPendingPlacements());
  }, []);

  const listInboundPending = useCallback(async () => {
    const pending = await listPendingPlacements();
    const statuses = await Promise.all(pending.map(item => getTag(item.epc)));
    return pending.filter((_, index) => statuses[index]?.inventoryStatus !== 'in_stock');
  }, []);

  const updateInboundItem = useCallback((epc: string, patch: Partial<ScannedItem>) => {
    setItems(current => current.map(item => item.epc === epc ? { ...item, ...patch } : item));
    const pendingPatch: Record<string, string | undefined> = {};
    if (patch.productName !== undefined) pendingPatch.productName = patch.productName;
    if (patch.description !== undefined) pendingPatch.description = patch.description;
    if (patch.unit !== undefined) pendingPatch.unit = patch.unit;
    if (patch.quantity !== undefined) pendingPatch.quantity = patch.quantity;
    if (patch.room !== undefined) pendingPatch.room = patch.room;
    if (patch.rack !== undefined) pendingPatch.rack = patch.rack;
    void updatePendingPlacementDrafts([epc], pendingPatch);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void (async () => {
        await reconcilePendingPlacements();
        await refreshPending();
        setPlacements(await listPlacements());
        if (operation === 'inbound') {
          const pending = await listInboundPending();
          if (pending.length > 0) {
            for (const item of pending) seenEpcs.current.add(item.epc);
            const restored = new Map<string, ScannedItem>(
                pending.map(item => [
                  item.epc,
                  {
                    epc: item.epc,
                    atMs: item.scannedAt,
                    productName: item.productName,
                    description: item.description,
                    unit: item.unit,
                    quantity: item.quantity,
                    room: item.room,
                    rack: item.rack,
                  },
                ]),
              );
            setItems([...restored.values()]);
          }
        }
      })();
    }, [listInboundPending, operation, refreshPending]),
  );

  const addEpc = useCallback(
    async (raw: string, atMs = Date.now()) => {
      const epc = normalizeEpc(raw);
      if (!epc) {
        Alert.alert(
          'EPC tidak valid',
          'Pastikan tag mengirim EPC hexadecimal yang valid.',
        );
        return;
      }
      if (seenEpcs.current.has(epc)) {
        return;
      }
      seenEpcs.current.add(epc);
      playScanFeedback(settings.haptics);
      setItems(current => [...current, { epc, atMs }]);
      try {
        if (operation === 'inbound') {
          await registerInboundScan(epc, atMs);
          const draft = (await listPendingPlacements()).find(item => item.epc === epc);
          if (draft) {
            setItems(current => current.map(item => item.epc === epc ? {
              ...item,
              productName: item.productName ?? draft.productName,
              description: item.description ?? draft.description,
              unit: item.unit ?? draft.unit,
              quantity: item.quantity ?? draft.quantity,
              room: item.room ?? draft.room,
              rack: item.rack ?? draft.rack,
            } : item));
          }
          await refreshPending();
        } else {
          const tag = await getTag(epc);
          if (!tag || tag.inventoryStatus !== 'in_stock') {
            throw new Error(
              'Tag belum terdaftar sebagai barang yang tersedia dalam stok.',
            );
          }
          setItems(current =>
            current.map(item =>
              item.epc === epc
                ? {
                    ...item,
                    room: tag.room,
                    rack: tag.rack,
                    productName: tag.productName,
                    description: tag.description,
                    unit: tag.unit,
                    quantity: tag.quantity === undefined ? undefined : String(tag.quantity),
                  }
                : item,
            ),
          );
        }
      } catch (error) {
        seenEpcs.current.delete(epc);
        setItems(current => current.filter(item => item.epc !== epc));
        Alert.alert(
          'Tag tidak dapat diproses',
          error instanceof Error ? error.message : 'Terjadi kesalahan.',
        );
      }
    },
    [operation, refreshPending, settings.haptics],
  );

  const onTag = useCallback(
    (event: { epc: string; at: number }) => {
      addEpc(event.epc, event.at);
    },
    [addEpc],
  );
  const reader = useUhfReader({
    enabled: focused && settings.readerMode === 'sdk',
    onTag,
  });

  const overdue = useMemo(
    () =>
      operation === 'inbound'
        ? items.filter(item => now - item.atMs >= 60_000 && missingProductFields(item).length > 0)
        : [],
    [items, now, operation],
  );
  const pendingCount = pendingRows.filter(
    item =>
      now - item.scannedAt >= 60_000 &&
      missingProductFields(item).length > 0,
  ).length;

  const submit = useCallback(() => {
    if (items.length === 0) {
      Alert.alert(
        'Belum ada barang',
        'Pindai setidaknya satu tag terlebih dahulu.',
      );
      return;
    }
    if (operation === 'inbound' && items.some(item =>
      !isProductComplete(item) || !item.room?.trim() || !item.rack?.trim(),
    )) {
      Alert.alert(
        'Data barang belum lengkap',
        'Lengkapi nama, deskripsi, satuan, jumlah, dan penempatan untuk setiap tag inbound.',
      );
      return;
    }
    if (operation === 'relocation' &&
      (!placements.some(item => item.id === selectedPlacementId) || !room.trim() || !rack.trim())) {
      Alert.alert('Penempatan belum dipilih', 'Pilih lokasi tujuan dari daftar penempatan.');
      return;
    }
    const count = items.length;
    const detailsByEpc = operation === 'inbound'
      ? Object.fromEntries(items.map(item => [item.epc, {
          productName: item.productName!.trim(),
          description: item.description!.trim(),
          unit: item.unit!,
          quantity: parseQuantity(item.quantity!)!,
          room: item.room!.trim(),
          rack: item.rack!.trim(),
        }]))
      : undefined;
    const operationLabel =
      operation === 'inbound'
        ? 'inbound'
        : operation === 'outbound'
        ? 'outbound'
        : 'relocation';
    Alert.alert(
      `Konfirmasi ${operationLabel}`,
      operation === 'outbound'
        ? `Proses ${count} tag sebagai barang keluar?`
        : operation === 'inbound'
        ? `Simpan data barang dan penempatan untuk ${count} tag?`
        : `Proses ${count} tag ke ${room.trim()} / ${rack.trim()}?`,
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Konfirmasi',
          onPress: () => {
            void (async () => {
              setBusy(true);
              try {
                await commitInventoryOperation(
                  operation,
                  items.map(item => item.epc),
                  operation === 'relocation' ? { room, rack } : undefined,
                  detailsByEpc,
                );
                if (operation === 'inbound') {
                  await removePendingPlacements(items.map(item => item.epc));
                  await refreshPending();
                }
                seenEpcs.current.clear();
                setItems([]);
                setRoom('');
                setRack('');
                setBulkLocation(undefined);
                setBulkPlacementId(undefined);
                Alert.alert(
                  'Selesai',
                  `${count} barang berhasil diproses sebagai ${operationLabel}.`,
                );
              } catch (error) {
                Alert.alert(
                  'Transaksi gagal',
                  error instanceof Error ? error.message : 'Terjadi kesalahan.',
                );
              } finally {
                setBusy(false);
              }
            })();
          },
        },
      ],
    );
  }, [
    items,
    operation,
    placements,
    rack,
    refreshPending,
    room,
    selectedPlacementId,
  ]);

  const selectOperation = async (next: InventoryOperation) => {
    setOperation(next);
    if (next === 'inbound') {
      const pending = await listInboundPending();
      for (const item of pending) seenEpcs.current.add(item.epc);
      const restored = new Map<string, ScannedItem>(
          pending.map(item => [
            item.epc,
            {
              epc: item.epc,
              atMs: item.scannedAt,
              productName: item.productName,
              description: item.description,
              unit: item.unit,
              quantity: item.quantity,
              room: item.room,
              rack: item.rack,
            },
          ]),
        );
      setItems([...restored.values()]);
      setRoom('');
      setRack('');
      setSelectedPlacementId(undefined);
      setBulkPlacementId(undefined);
      setBulkLocation(undefined);
      setPlacements(await listPlacements());
    } else {
      setItems([]);
      seenEpcs.current.clear();
    }
    if (next !== 'inbound') {
      setRoom('');
      setRack('');
      setSelectedPlacementId(undefined);
      setBulkPlacementId(undefined);
      setBulkLocation(undefined);
    }
  };

  return (
    <Screen scroll>
      <View style={styles.pageHeader}>
        <View style={styles.headerText}>
          <Text style={styles.title}>Inventory</Text>
          <Text style={styles.subtitle}>
            Catat barang masuk, keluar, dan perpindahan lokasi.
          </Text>
        </View>
        <Pressable
          onPress={() => navigation.navigate('Notifications')}
          style={styles.bellButton}
          accessibilityLabel="Buka notifikasi penempatan"
        >
          <Text style={styles.bell}>🔔</Text>
          {pendingCount > 0 ? (
            <View style={styles.bellBadge}>
              <Text style={styles.bellBadgeText}>
                {pendingCount > 99 ? '99+' : pendingCount}
              </Text>
            </View>
          ) : null}
        </Pressable>
      </View>

      <View style={styles.operationRow}>
        {OPERATIONS.map(item => {
          const active = operation === item.key;
          return (
            <Pressable
              key={item.key}
              onPress={() => void selectOperation(item.key)}
              style={[styles.operationButton, active && styles.operationActive]}
            >
              <Text
                style={[
                  styles.operationText,
                  active && styles.operationTextActive,
                ]}
              >
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Card style={styles.card}>
        <Text style={styles.sectionTitle}>
          {operation === 'inbound'
            ? 'Barang masuk'
            : operation === 'outbound'
            ? 'Barang keluar'
            : 'Pindah lokasi'}
        </Text>
        <Text style={styles.helper}>
          Pindai tag menggunakan tombol fisik pada handheld.
        </Text>
        {settings.readerMode === 'sdk' ? (
          <Button
            label={reader.reading ? 'Stop scan' : 'Mulai scan'}
            variant={reader.reading ? 'danger' : 'primary'}
            compact
            onPress={() =>
              void (reader.reading ? reader.stop() : reader.start())
            }
            style={styles.scanButton}
          />
        ) : null}
        <Text style={styles.readerStatus}>
          {settings.readerMode === 'sdk'
            ? reader.status.message
            : 'Mode simulasi aktif'}
        </Text>
      </Card>

      {operation === 'inbound' && items.length > 0 ? (
        <Card style={styles.card}>
          <Text style={styles.sectionTitle}>Penempatan untuk semua tag (opsional)</Text>
          <PlacementPicker
            placements={placements}
            selectedId={bulkPlacementId}
            onSelect={placement => {
              setBulkPlacementId(placement.id);
              setBulkLocation({ room: placement.room, rack: placement.rack });
            }}
            onManage={() => navigation.navigate('PlacementSettings')}
          />
          <Button
            label="Terapkan penempatan ini ke semua tag"
            variant="secondary"
            disabled={!bulkLocation}
            onPress={() => {
              if (!bulkLocation) return;
              const patch = { room: bulkLocation.room, rack: bulkLocation.rack };
              setItems(current => current.map(item => ({ ...item, ...patch })));
              void updatePendingPlacementDrafts(items.map(item => item.epc), patch).then(refreshPending);
            }}
            style={styles.bulkButton}
          />
          <Text style={styles.helper}>Anda tetap bisa memilih penempatan berbeda pada masing-masing tag di bawah.</Text>
        </Card>
      ) : null}

      {operation === 'relocation' ? (
        <Card style={styles.card}>
          <Text style={styles.sectionTitle}>Lokasi tujuan</Text>
          <PlacementPicker
            placements={placements}
            selectedId={selectedPlacementId}
            onSelect={placement => {
              setSelectedPlacementId(placement.id);
              setRoom(placement.room);
              setRack(placement.rack);
            }}
            onManage={() => navigation.navigate('PlacementSettings')}
          />
          <Text style={styles.helper}>
            Penempatan tujuan diterapkan ke semua tag relocation setelah konfirmasi.
          </Text>
        </Card>
      ) : null}

      {overdue.length > 0 ? (
        <Card tone="danger" style={styles.warning}>
          <Text style={styles.warningTitle}>Data barang belum lengkap</Text>
          <Text style={styles.warningText}>
            {overdue.length} tag inbound belum lengkap lebih dari 1 menit. Lengkapi data produk dan penempatannya.
          </Text>
          {overdue.slice(0, 4).map(item => (
            <Text key={item.epc} style={styles.warningEpc}>
              {formatEpc(item.epc)}
            </Text>
          ))}
        </Card>
      ) : null}

      <View style={styles.listHeading}>
        <Text style={styles.sectionTitle}>Barang dipindai</Text>
        <Badge label={`${items.length} barang`} variant="accent" />
      </View>
      {items.length === 0 ? (
        <EmptyState
          title="Belum ada barang"
          description="Hasil scan akan tampil di sini."
        />
      ) : (
        <Card style={styles.card}>
          {items.map((item, index) => (
            operation === 'inbound' ? (
              <View key={item.epc} style={styles.productForm}>
                <View style={styles.productHeader}>
                  <View style={styles.itemMain}>
                    <Text style={styles.epc}>{formatEpc(item.epc)}</Text>
                  </View>
                  <Badge label="TAG" variant="new" />
                </View>
                <Text style={styles.fieldLabel}>Nama barang</Text>
                <TextInput value={item.productName ?? ''} onChangeText={value => updateInboundItem(item.epc, { productName: value })} placeholder="Contoh: Biji kopi Arabika" placeholderTextColor={colors.faint} style={styles.input} />
                <Text style={styles.fieldLabel}>Deskripsi produk</Text>
                <TextInput value={item.description ?? ''} onChangeText={value => updateInboundItem(item.epc, { description: value })} placeholder="Deskripsi / spesifikasi produk" placeholderTextColor={colors.faint} style={[styles.input, styles.descriptionInput]} multiline numberOfLines={3} />
                <Text style={styles.fieldLabel}>Satuan</Text>
                <View style={styles.unitRow}>
                  {PRODUCT_UNITS.map(unit => {
                    const active = item.unit === unit;
                    return (
                      <Pressable key={unit} onPress={() => updateInboundItem(item.epc, { unit })} style={[styles.unitButton, active && styles.unitButtonActive]}>
                        <Text style={[styles.unitText, active && styles.unitTextActive]}>{unit}</Text>
                      </Pressable>
                    );
                  })}
                </View>
                <Text style={styles.fieldLabel}>Jumlah</Text>
                <TextInput value={item.quantity ?? ''} onChangeText={value => updateInboundItem(item.epc, { quantity: value.replace(/[^0-9.,]/g, '') })} placeholder="Contoh: 1.5" placeholderTextColor={colors.faint} keyboardType="decimal-pad" style={styles.input} />
                <Text style={styles.fieldLabel}>Penempatan</Text>
                <PlacementPicker
                  placements={placements}
                  selectedId={placements.find(place => place.room === item.room && place.rack === item.rack)?.id}
                  onSelect={placement => updateInboundItem(item.epc, { room: placement.room, rack: placement.rack })}
                  onManage={() => navigation.navigate('PlacementSettings')}
                />
              </View>
            ) : (
              <View key={item.epc} style={[styles.itemRow, index > 0 && styles.divider]}>
                <View style={styles.itemMain}>
                  <Text style={styles.epc}>{formatEpc(item.epc)}</Text>
                  {operation === 'relocation' ? <Text style={styles.itemNote}>Lokasi saat ini: {item.room || 'Belum diketahui'} / {item.rack || 'Belum diketahui'}</Text> : null}
                  {item.productName ? <Text style={styles.itemNote}>{item.productName} · {item.quantity ?? '—'} {item.unit ?? ''}</Text> : null}
                </View>
                <Badge label="TAG" variant="new" />
              </View>
            )
          ))}
        </Card>
      )}
      <Button
        label={
          busy
            ? 'Menyimpan…'
            : operation === 'inbound'
            ? 'Konfirmasi inbound'
            : operation === 'outbound'
            ? 'Konfirmasi outbound'
            : 'Konfirmasi relocation'
        }
        onPress={() => void submit()}
        disabled={busy || items.length === 0}
        style={styles.confirm}
      />
      {items.length > 0 ? (
      <Button
          label="Bersihkan daftar"
          variant="ghost"
          onPress={() => {
            setItems([]);
            seenEpcs.current.clear();
          }}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { ...type.title, color: colors.text },
  pageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  headerText: { flex: 1 },
  subtitle: { ...type.small, color: colors.muted, marginTop: spacing.xs, lineHeight: 19 },
  bellButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing.sm,
  },
  bell: { fontSize: 22 },
  bellBadge: {
    position: 'absolute',
    top: -3,
    right: -3,
    minWidth: 19,
    height: 19,
    paddingHorizontal: 4,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.danger,
  },
  bellBadgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  operationRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  operationButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    minHeight: 46,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.sm,
  },
  operationActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  operationText: {
    ...type.small,
    color: colors.muted,
    fontWeight: '700',
    textTransform: 'none',
    letterSpacing: 0,
  },
  operationTextActive: { color: colors.accent },
  card: { marginBottom: spacing.lg },
  sectionTitle: { ...type.body, color: colors.text, fontWeight: '700', marginBottom: spacing.xs },
  helper: {
    ...type.tiny,
    color: colors.muted,
    textTransform: 'none',
    letterSpacing: 0,
    marginTop: spacing.sm,
    lineHeight: 17,
  },
  scanButton: { marginTop: spacing.md },
  readerStatus: {
    ...type.tiny,
    color: colors.faint,
    marginTop: spacing.sm,
    textTransform: 'none',
    letterSpacing: 0,
  },
  input: {
    minWidth: 0,
    width: '100%',
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontFamily: fonts.mono,
    fontSize: 14,
  },
  bulkButton: { marginTop: spacing.md },
  productForm: { padding: spacing.md, marginVertical: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg },
  productHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md, paddingBottom: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  fieldLabel: { ...type.small, color: colors.text, fontWeight: '700', marginTop: spacing.md, marginBottom: spacing.xs, textTransform: 'none', letterSpacing: 0 },
  descriptionInput: { minHeight: 84, textAlignVertical: 'top', fontFamily: undefined },
  unitRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  unitButton: { flex: 1, alignItems: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingVertical: spacing.md, backgroundColor: colors.surface },
  unitButtonActive: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  unitText: { ...type.small, color: colors.muted, fontWeight: '700' },
  unitTextActive: { color: colors.accent },
  warning: { marginBottom: spacing.md },
  warningTitle: { ...type.body, color: colors.danger, fontWeight: '700' },
  warningText: { ...type.small, color: colors.text, marginTop: 4 },
  warningEpc: {
    ...type.tiny,
    color: colors.text,
    fontFamily: fonts.mono,
    marginTop: spacing.xs,
  },
  listHeading: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.lg,
  },
  divider: { borderTopWidth: 1, borderTopColor: colors.border },
  itemMain: { flex: 1 },
  epc: { ...type.small, color: colors.text, fontFamily: fonts.mono },
  itemNote: {
    ...type.tiny,
    color: colors.muted,
    marginTop: 3,
    textTransform: 'none',
    letterSpacing: 0,
  },
  confirm: { marginTop: spacing.md, marginBottom: spacing.sm, minHeight: 54 },
});
