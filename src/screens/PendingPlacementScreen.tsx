import React, { useCallback, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { KeyValueRow } from '../components/KeyValueRow';
import { PlacementPicker } from '../components/PlacementPicker';
import { Screen } from '../components/Screen';
import { formatEpc } from '../domain/epc';
import { isProductComplete, parseQuantity, PRODUCT_UNITS, type ProductUnit } from '../domain/product';
import type { PendingPlacement, Placement, TagRecord } from '../domain/types';
import type { RootStackParamList } from '../navigation/types';
import { commitInventoryOperation, completeExistingTagDetails } from '../storage/inventoryRepo';
import { listPendingPlacements, removePendingPlacements, updatePendingPlacement } from '../storage/pendingPlacementRepo';
import { listPlacements } from '../storage/placementRepo';
import { getTag } from '../storage/tagRepo';
import { colors, radius, spacing, type } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'PendingPlacement'>;

export function PendingPlacementScreen({ route, navigation }: Props) {
  const { epc } = route.params;
  const [pending, setPending] = useState<PendingPlacement | null>(null);
  const [tag, setTag] = useState<TagRecord | null>(null);
  const [room, setRoom] = useState('');
  const [rack, setRack] = useState('');
  const [productName, setProductName] = useState('');
  const [description, setDescription] = useState('');
  const [unit, setUnit] = useState<ProductUnit>();
  const [quantity, setQuantity] = useState('');
  const [placements, setPlacements] = useState<Placement[]>([]);
  const [selectedPlacementId, setSelectedPlacementId] = useState<string>();
  const [saving, setSaving] = useState(false);

  useFocusEffect(useCallback(() => {
    void Promise.all([listPendingPlacements(), listPlacements(), getTag(epc)]).then(([rows, savedPlacements, tagRecord]) => {
      const record = rows.find(item => item.epc === epc) ?? null;
      setPending(record);
      setTag(tagRecord);
      setRoom(record?.room ?? '');
      setRack(record?.rack ?? '');
      setProductName(record?.productName ?? '');
      setDescription(record?.description ?? '');
      setUnit(record?.unit);
      setQuantity(record?.quantity ?? '');
      setPlacements(savedPlacements);
      setSelectedPlacementId(record
        ? savedPlacements.find(item => item.room === record.room && item.rack === record.rack)?.id
        : undefined);
    });
  }, [epc]));

  const save = useCallback(() => {
    if (!pending) {
      Alert.alert('Tag tidak ditemukan', 'Tag ini sudah tidak ada dalam daftar penempatan tertunda.');
      return;
    }
    const product = { productName, description, unit, quantity: parseQuantity(quantity) ?? undefined };
    if (!isProductComplete(product) || !placements.some(item => item.id === selectedPlacementId) || !room.trim() || !rack.trim()) {
      Alert.alert('Data belum lengkap', 'Lengkapi nama, deskripsi, satuan, jumlah, dan penempatan dari daftar.');
      return;
    }
    Alert.alert(
      'Konfirmasi penempatan',
      `Simpan data ${productName.trim()} dan penempatan ${room.trim()} / ${rack.trim()}?`,
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Konfirmasi',
          onPress: () => {
            void (async () => {
              setSaving(true);
              try {
                const details = {
                  productName: productName.trim(),
                  description: description.trim(),
                  unit: unit!,
                  quantity: parseQuantity(quantity)!,
                  room: room.trim(),
                  rack: rack.trim(),
                };
                await updatePendingPlacement(epc, {
                  ...details,
                  quantity: String(details.quantity),
                });
                if (tag?.inventoryStatus === 'in_stock') {
                  await completeExistingTagDetails(epc, details);
                } else {
                  await commitInventoryOperation('inbound', [epc], undefined, { [epc]: details });
                }
                await removePendingPlacements([epc]);
                Alert.alert('Selesai', tag?.inventoryStatus === 'in_stock'
                  ? 'Data produk dan penempatan tag berhasil dilengkapi.'
                  : 'Data produk dan penempatan tersimpan; tag berhasil diproses sebagai inbound.', [
                  { text: 'OK', onPress: () => navigation.goBack() },
                ]);
              } catch (error) {
                Alert.alert('Gagal menyimpan', error instanceof Error ? error.message : 'Terjadi kesalahan.');
              } finally {
                setSaving(false);
              }
            })();
          },
        },
      ],
    );
  }, [description, epc, navigation, pending, placements, productName, quantity, rack, room, selectedPlacementId, tag, unit]);

  return (
    <Screen scroll>
      <Text style={styles.title}>Detail penempatan tag</Text>
      <Card style={styles.card}>
        <KeyValueRow label="EPC tag" value={formatEpc(epc)} mono />
        <KeyValueRow label="Status" value={pending ? 'Menunggu detail penempatan' : 'Tidak ada di daftar tertunda'} />
      </Card>
      <Text style={styles.label}>Nama barang</Text>
      <TextInput value={productName} onChangeText={setProductName} placeholder="Contoh: Biji kopi Arabika" placeholderTextColor={colors.faint} style={styles.input} />
      <Text style={styles.label}>Deskripsi produk</Text>
      <TextInput value={description} onChangeText={setDescription} placeholder="Deskripsi / spesifikasi produk" placeholderTextColor={colors.faint} style={[styles.input, styles.descriptionInput]} multiline numberOfLines={3} />
      <Text style={styles.label}>Satuan</Text>
      <View style={styles.unitRow}>
        {PRODUCT_UNITS.map(item => (
          <Pressable key={item} onPress={() => setUnit(item)} style={[styles.unitButton, unit === item && styles.unitButtonActive]}>
            <Text style={[styles.unitText, unit === item && styles.unitTextActive]}>{item}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.label}>Jumlah</Text>
      <TextInput value={quantity} onChangeText={value => setQuantity(value.replace(/[^0-9.,]/g, ''))} placeholder="Contoh: 1.5" placeholderTextColor={colors.faint} keyboardType="decimal-pad" style={styles.input} />
      <Text style={[styles.label, styles.placementLabel]}>Penempatan</Text>
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
      <Button label={saving ? 'Menyimpan…' : 'Simpan penempatan'} onPress={() => void save()} disabled={saving} style={styles.button} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { ...type.title, color: colors.text },
  card: { marginTop: spacing.md, marginBottom: spacing.lg },
  label: { ...type.small, color: colors.text, fontWeight: '700', marginBottom: spacing.xs, marginTop: spacing.sm },
  input: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: spacing.md, paddingVertical: spacing.md, color: colors.text, marginBottom: spacing.sm, width: '100%' },
  descriptionInput: { minHeight: 76, textAlignVertical: 'top' },
  unitRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  unitButton: { flex: 1, alignItems: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingVertical: spacing.sm, backgroundColor: colors.surface },
  unitButtonActive: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  unitText: { ...type.small, color: colors.muted, fontWeight: '700' },
  unitTextActive: { color: colors.accent },
  placementLabel: { marginTop: spacing.md },
  button: { marginTop: spacing.sm },
});
