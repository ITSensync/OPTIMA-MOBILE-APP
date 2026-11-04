import React, { useCallback, useState } from 'react';
import { Alert, Share, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { EmptyState } from '../components/EmptyState';
import { KeyValueRow } from '../components/KeyValueRow';
import { Screen } from '../components/Screen';
import { formatEpc } from '../domain/epc';
import { localDateTime } from '../domain/datetime';
import type { TagRecord } from '../domain/types';
import type { RootStackParamList } from '../navigation/types';
import { deleteTag, getTag } from '../storage/tagRepo';
import { colors, fonts, spacing } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'TagDetail'>;

export function TagDetailScreen({ route, navigation }: Props) {
  const { epc } = route.params;
  const [tag, setTag] = useState<TagRecord | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      getTag(epc).then(row => {
        if (active) {
          setTag(row);
        }
      });
      return () => {
        active = false;
      };
    }, [epc]),
  );

  const onDelete = useCallback(() => {
    Alert.alert(
      'Hapus tag?',
      `Tag ${epc} akan dihapus dari master. Riwayat pembacaan tetap tersimpan.`,
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Hapus',
          style: 'destructive',
          onPress: async () => {
            await deleteTag(epc);
            navigation.goBack();
          },
        },
      ],
    );
  }, [epc, navigation]);

  const onShare = useCallback(async () => {
    await Share.share({ title: 'EPC', message: epc });
  }, [epc]);

  if (!tag) {
    return (
      <Screen>
        <EmptyState
          title="Tag tidak ditemukan"
          description="Mungkin sudah dihapus dari perangkat ini."
        />
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <Card tone="accent">
        <View style={styles.topRow}>
          <Badge label="TAG TERDAFTAR" variant="new" />
        </View>
        <Text style={styles.epc} selectable>
          {formatEpc(tag.epc)}
        </Text>
      </Card>

      <Card style={styles.card}>
        <KeyValueRow label="EPC" value={tag.epc} mono />
        <KeyValueRow
          label="Pertama terlihat"
          value={localDateTime(tag.firstSeenAt)}
        />
        <KeyValueRow
          label="Terakhir terlihat"
          value={localDateTime(tag.lastSeenAt)}
        />
        <KeyValueRow
          label="Status inventory"
          value={
            tag.inventoryStatus === 'outbound'
              ? 'Sudah keluar'
              : tag.inventoryStatus === 'in_stock'
              ? 'Dalam stok'
              : tag.inventoryStatus === 'pending_location'
              ? 'Menunggu penempatan'
              : 'Belum diproses inbound'
          }
        />
        <KeyValueRow label="Ruangan" value={tag.room || 'Belum ditentukan'} />
        <KeyValueRow label="Rak" value={tag.rack || 'Belum ditentukan'} />
        <KeyValueRow label="Nama barang" value={tag.productName || 'Belum diisi'} />
        <KeyValueRow label="Deskripsi" value={tag.description || 'Belum diisi'} />
        <KeyValueRow
          label="Jumlah"
          value={tag.quantity === undefined ? 'Belum diisi' : `${tag.quantity} ${tag.unit ?? ''}`.trim()}
        />
      </Card>

      {tag.inventoryStatus === 'pending_location' ? (
        <Button
          label="Isi detail penempatan"
          variant="primary"
          onPress={() => navigation.navigate('PendingPlacement', { epc })}
          style={styles.btn}
        />
      ) : null}
      <Button
        label="Bagikan EPC"
        variant="secondary"
        onPress={onShare}
        style={styles.btn}
      />
      <Button
        label="Hapus dari master"
        variant="danger"
        onPress={onDelete}
        style={styles.btn}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  epc: {
    fontFamily: fonts.mono,
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
    marginTop: spacing.md,
    lineHeight: 30,
    letterSpacing: 0.8,
  },
  card: { marginTop: spacing.md },
  btn: { marginTop: spacing.md },
});
