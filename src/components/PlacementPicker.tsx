import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { Placement } from '../domain/types';
import { colors, radius, spacing, type } from '../theme';
import { Button } from './Button';
import { Card } from './Card';

type Props = {
  placements: Placement[];
  selectedId?: string;
  onSelect: (placement: Placement) => void;
  onManage: () => void;
};

export function PlacementPicker({ placements, selectedId, onSelect, onManage }: Props) {
  const [visible, setVisible] = useState(false);
  const selected = placements.find(item => item.id === selectedId);

  return (
    <>
      <Pressable accessibilityRole="button" onPress={() => setVisible(true)} style={styles.trigger}>
        <View style={styles.triggerText}>
          <Text style={styles.label}>Penempatan</Text>
          <Text style={[styles.value, !selected && styles.placeholder]}>
            {selected ? `${selected.room} · ${selected.rack}` : 'Pilih ruangan dan rak'}
          </Text>
        </View>
        <Text style={styles.chevron}>›</Text>
      </Pressable>

      <Modal visible={visible} transparent animationType="slide" onRequestClose={() => setVisible(false)}>
        <View style={styles.backdrop}>
          <Card style={styles.modalCard}>
            <Text style={styles.title}>Pilih penempatan</Text>
            <Text style={styles.hint}>Pilih pasangan ruangan dan rak dari daftar.</Text>
            {placements.length === 0 ? (
              <Text style={styles.empty}>Daftar masih kosong. Tambahkan penempatan terlebih dahulu.</Text>
            ) : (
              <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
                {placements.map(item => (
                  <Pressable
                    key={item.id}
                    onPress={() => { onSelect(item); setVisible(false); }}
                    style={[styles.option, item.id === selectedId && styles.optionSelected]}
                  >
                    <Text style={styles.optionRoom}>{item.room}</Text>
                    <Text style={styles.optionRack}>{item.rack}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            )}
            <Button label="Kelola daftar penempatan" variant="secondary" onPress={() => { setVisible(false); onManage(); }} style={styles.manage} />
            <Button label="Tutup" variant="ghost" onPress={() => setVisible(false)} style={styles.close} />
          </Card>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, minHeight: 62 },
  triggerText: { flex: 1 },
  label: { ...type.tiny, color: colors.muted, textTransform: 'none', letterSpacing: 0 },
  value: { ...type.body, color: colors.text, fontWeight: '700', marginTop: 3 },
  placeholder: { color: colors.faint, fontWeight: '500' },
  chevron: { color: colors.accent, fontSize: 28, marginLeft: spacing.sm },
  backdrop: { flex: 1, justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.72)', padding: spacing.lg },
  modalCard: { maxHeight: '85%' },
  title: { ...type.h2, color: colors.text },
  hint: { ...type.small, color: colors.muted, marginTop: spacing.xs, marginBottom: spacing.md },
  list: { flexGrow: 0, maxHeight: 380 },
  option: { padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, marginBottom: spacing.sm, backgroundColor: colors.bg },
  optionSelected: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  optionRoom: { ...type.body, color: colors.text, fontWeight: '700' },
  optionRack: { ...type.small, color: colors.muted, marginTop: 2 },
  empty: { ...type.small, color: colors.muted, paddingVertical: spacing.lg },
  manage: { marginTop: spacing.md },
  close: { marginTop: spacing.sm },
});
