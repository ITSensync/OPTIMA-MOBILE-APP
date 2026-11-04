import React, { useCallback, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { EmptyState } from '../components/EmptyState';
import { Screen } from '../components/Screen';
import type { Placement } from '../domain/types';
import { deletePlacement, listPlacements, savePlacement } from '../storage/placementRepo';
import { colors, fonts, radius, spacing, type } from '../theme';

export function PlacementSettingsScreen() {
  const [placements, setPlacements] = useState<Placement[]>([]);
  const [editingId, setEditingId] = useState<string | undefined>();
  const [room, setRoom] = useState('');
  const [rack, setRack] = useState('');
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => setPlacements(await listPlacements()), []);
  useFocusEffect(useCallback(() => { void refresh(); }, [refresh]));

  const clearForm = () => { setEditingId(undefined); setRoom(''); setRack(''); };

  const submit = async () => {
    if (!room.trim() || !rack.trim()) {
      Alert.alert('Data belum lengkap', 'Isi ruangan dan rak terlebih dahulu.');
      return;
    }
    setSaving(true);
    try {
      await savePlacement({ id: editingId, room, rack });
      await refresh();
      clearForm();
    } catch (error) {
      Alert.alert('Gagal menyimpan', error instanceof Error ? error.message : 'Terjadi kesalahan.');
    } finally {
      setSaving(false);
    }
  };

  const remove = (placement: Placement) => Alert.alert(
    'Hapus penempatan?',
    `${placement.room} · ${placement.rack} akan dihapus dari pilihan penempatan. Data transaksi lama tidak berubah.`,
    [
      { text: 'Batal', style: 'cancel' },
      { text: 'Hapus', style: 'destructive', onPress: () => { void deletePlacement(placement.id).then(refresh); } },
    ],
  );

  return (
    <Screen scroll>
      <Text style={styles.title}>Daftar penempatan</Text>
      <Text style={styles.subtitle}>Tambahkan pasangan ruangan dan rak yang akan dipilih saat inbound atau relocation.</Text>

      <Card style={styles.form}>
        <Text style={styles.sectionTitle}>{editingId ? 'Ubah penempatan' : 'Tambah penempatan'}</Text>
        <Text style={styles.label}>Ruangan</Text>
        <TextInput value={room} onChangeText={setRoom} placeholder="Contoh: Gudang A" placeholderTextColor={colors.faint} style={styles.input} />
        <Text style={styles.label}>Rak</Text>
        <TextInput value={rack} onChangeText={setRack} placeholder="Contoh: Rak 01" placeholderTextColor={colors.faint} style={styles.input} />
        <Button label={saving ? 'Menyimpan…' : editingId ? 'Simpan perubahan' : 'Tambah ke daftar'} onPress={() => void submit()} disabled={saving} style={styles.submit} />
        {editingId ? <Button label="Batal ubah" variant="ghost" onPress={clearForm} style={styles.cancel} /> : null}
      </Card>

      <Text style={styles.listTitle}>Penempatan tersedia ({placements.length})</Text>
      {placements.length === 0 ? (
        <EmptyState title="Daftar masih kosong" description="Tambahkan ruangan dan rak di atas agar bisa dipilih untuk transaksi." />
      ) : placements.map(item => (
        <Card key={item.id} style={styles.row}>
          <View style={styles.rowMain}>
            <Text style={styles.room}>{item.room}</Text>
            <Text style={styles.rack}>{item.rack}</Text>
          </View>
          <View style={styles.actions}>
            <Pressable onPress={() => { setEditingId(item.id); setRoom(item.room); setRack(item.rack); }} style={styles.action}>
              <Text style={styles.edit}>Ubah</Text>
            </Pressable>
            <Pressable onPress={() => remove(item)} style={styles.action}>
              <Text style={styles.delete}>Hapus</Text>
            </Pressable>
          </View>
        </Card>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { ...type.title, color: colors.text },
  subtitle: { ...type.small, color: colors.muted, marginTop: 3, marginBottom: spacing.md },
  form: { marginBottom: spacing.lg },
  sectionTitle: { ...type.h2, color: colors.text, marginBottom: spacing.md },
  label: { ...type.small, color: colors.text, fontWeight: '700', marginBottom: spacing.xs },
  input: { backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.md, color: colors.text, fontFamily: fonts.mono, marginBottom: spacing.md },
  submit: { marginTop: spacing.xs },
  cancel: { marginTop: spacing.sm },
  listTitle: { ...type.h2, color: colors.text, marginBottom: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  rowMain: { flex: 1 },
  room: { ...type.body, color: colors.text, fontWeight: '700' },
  rack: { ...type.small, color: colors.muted, marginTop: 3 },
  actions: { flexDirection: 'row', gap: spacing.md },
  action: { padding: spacing.sm },
  edit: { ...type.small, color: colors.accent, fontWeight: '700' },
  delete: { ...type.small, color: colors.danger, fontWeight: '700' },
});
