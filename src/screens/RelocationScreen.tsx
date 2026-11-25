import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useIsFocused } from '@react-navigation/native';

import {
  createRelocation,
  fetchActiveRacks,
  isFinalActionSuccess,
  previewRelocation,
  PlacementTimeoutError,
  type RelocationPreviewData,
  type PreviewItem,
  type Rack,
} from '../api/placementApi';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { EmptyState } from '../components/EmptyState';
import { summarizeRelocation } from '../domain/relocation';
import { errorMessage, previewItemMessage } from '../domain/placementErrors';
import { localDateTime } from '../domain/datetime';
import { playScanFeedback } from '../reader/scanFeedback';
import { useUhfReader } from '../reader/useUhfReader';
import { useSettings } from '../state/SettingsProvider';
import {
  clearPendingRelocationSubmission,
  getPendingRelocationSubmission,
  savePendingRelocationSubmission,
  type PendingRelocationSubmission,
} from '../storage/relocationSubmissionRepo';
import { getPendingPlacementSubmission } from '../storage/placementSubmissionRepo';
import { colors, fonts, radius, spacing, type } from '../theme';
import { Screen } from '../components/Screen';

type SubmitState = 'idle' | 'loading' | 'success' | 'error';

function rfidKey(value: string): string {
  return value.trim().toUpperCase();
}

function requestId(): string {
  const random = () => Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, '0');
  return `RELOCATION-${random()}-${random()}-${Date.now().toString(16)}`;
}

function rackLabel(rack?: PreviewItem['current_rack'] | null): string {
  return rack ? `${rack.code}${rack.name ? ` · ${rack.name}` : ''}` : 'Tidak tersedia';
}

function expiryLabel(value?: string | null): string {
  return value ? `Exp: ${value}` : 'Exp: tidak tersedia';
}

export function RelocationScreen() {
  const focused = useIsFocused();
  const { settings } = useSettings();
  const [racks, setRacks] = useState<Rack[]>([]);
  const [targetRack, setTargetRack] = useState<Rack | null>(null);
  const [scannedRfidNumbers, setScannedRfidNumbers] = useState<string[]>([]);
  const [preview, setPreview] = useState<RelocationPreviewData | null>(null);
  const [previewItems, setPreviewItems] = useState<PreviewItem[]>([]);
  const [loadingRacks, setLoadingRacks] = useState(false);
  const [validating, setValidating] = useState(false);
  const [submitState, setSubmitState] = useState<SubmitState>('idle');
  const [error, setError] = useState<string>();
  const [successText, setSuccessText] = useState<string>();
  const [manualRfid, setManualRfid] = useState('');
  const [pending, setPending] = useState<PendingRelocationSubmission | null>(null);
  const [blockedByPlacement, setBlockedByPlacement] = useState(false);
  const scannedKeys = useRef(new Set<string>());
  const autoRetried = useRef(false);

  const loadRacks = useCallback(async () => {
    setLoadingRacks(true);
    try {
      const next = await fetchActiveRacks();
      setRacks(next);
      setTargetRack(current => current && next.some(rack => rack.id === current.id) ? current : null);
    } catch (loadError) {
      setError(errorMessage(loadError, 'Daftar rak gagal dimuat.'));
    } finally {
      setLoadingRacks(false);
    }
  }, []);

  const addRfid = useCallback((raw: string) => {
    const value = raw.trim();
    if (!value) return;
    const key = rfidKey(value);
    if (scannedKeys.current.has(key)) {
      setError('RFID yang sama sudah ada di daftar.');
      return;
    }
    scannedKeys.current.add(key);
    playScanFeedback(settings.haptics);
    setScannedRfidNumbers(current => [...current, value]);
    setPreview(null);
    setPreviewItems([]);
    setError(undefined);
    setSuccessText(undefined);
  }, [settings.haptics]);

  const onTag = useCallback((event: { epc: string; at: number }) => addRfid(event.epc), [addRfid]);
  const reader = useUhfReader({
    enabled: focused && settings.readerMode === 'sdk' && Boolean(targetRack) && !pending && !blockedByPlacement,
    onTag,
  });

  const validate = useCallback(async () => {
    if (!targetRack || scannedRfidNumbers.length === 0) return;
    setValidating(true);
    setError(undefined);
    try {
      const result = await previewRelocation(targetRack.id, scannedRfidNumbers);
      setPreview(result);
      setPreviewItems(result.items);
      if (!result.eligible || result.items.some(item => !item.eligible)) {
        setError('Ada RFID yang belum dapat direlokasi. Periksa detail di bawah.');
      }
    } catch (validationError) {
      setError(errorMessage(validationError, 'Preview relocation gagal.'));
    } finally {
      setValidating(false);
    }
  }, [scannedRfidNumbers, targetRack]);

  const submitSaved = useCallback(async (submission: PendingRelocationSubmission) => {
    setSubmitState('loading');
    setError(undefined);
    try {
      let result;
      try {
        result = await createRelocation(submission.rackId, submission.rfidNumbers, submission.clientRequestId);
      } catch (firstError) {
        if (!(firstError instanceof PlacementTimeoutError)) throw firstError;
        result = await createRelocation(submission.rackId, submission.rfidNumbers, submission.clientRequestId);
      }
      if (!isFinalActionSuccess(result.status, result.data)) {
        throw new Error('Response relocation belum dikonfirmasi oleh backend.');
      }
      await clearPendingRelocationSubmission();
      setPending(null);
      setSubmitState('success');
      scannedKeys.current.clear();
      setScannedRfidNumbers([]);
      setPreviewItems([]);
      setPreview(null);
      setTargetRack(null);
      setSuccessText(
        `${result.data.total_relocated ?? result.data.total_placed ?? submission.rfidNumbers.length} barang berhasil dipindahkan${
          result.data.placed_at ? ` pada ${localDateTime(result.data.placed_at)}` : '.'
        }`,
      );
    } catch (submitError) {
      setPending(submission);
      setSubmitState('error');
      setError(errorMessage(submitError, 'Relocation gagal diproses.'));
    }
  }, []);

  useEffect(() => {
    void loadRacks();
    void Promise.all([getPendingRelocationSubmission(), getPendingPlacementSubmission()]).then(([saved, placement]) => {
      setBlockedByPlacement(Boolean(placement));
      if (!saved) return;
      setPending(saved);
      scannedKeys.current = new Set(saved.rfidNumbers.map(rfidKey));
      setScannedRfidNumbers(saved.rfidNumbers);
      if (!autoRetried.current) {
        autoRetried.current = true;
        void submitSaved(saved);
      }
    });
  }, [loadRacks, submitSaved]);

  useEffect(() => {
    if (!focused) return;
    void getPendingPlacementSubmission().then(placement => {
      setBlockedByPlacement(Boolean(placement));
    });
  }, [focused]);

  useEffect(() => {
    if (!pending || targetRack) return;
    const restoredRack = racks.find(rack => rack.id === pending.rackId);
    if (restoredRack) setTargetRack(restoredRack);
  }, [pending, racks, targetRack]);

  const removeRfid = useCallback((rfid: string) => {
    scannedKeys.current.delete(rfidKey(rfid));
    setScannedRfidNumbers(current => current.filter(item => item !== rfid));
    setPreview(null);
    setPreviewItems([]);
    setError(undefined);
  }, []);

  const submit = useCallback(async () => {
    const eligible = Boolean(
      targetRack && preview?.eligible &&
      scannedRfidNumbers.length > 0 &&
      previewItems.length === scannedRfidNumbers.length &&
      previewItems.every(item => item.eligible),
    );
    if (!eligible || pending || submitState === 'loading') {
      setError('Pilih rak tujuan dan pastikan semua RFID eligible sebelum submit.');
      return;
    }
    const submission: PendingRelocationSubmission = {
      rackId: targetRack!.id,
      rfidNumbers: [...scannedRfidNumbers],
      clientRequestId: requestId(),
      createdAt: new Date().toISOString(),
    };
    try {
      await savePendingRelocationSubmission(submission);
      setPending(submission);
      await submitSaved(submission);
    } catch (saveError) {
      setSubmitState('error');
      setError(errorMessage(saveError, 'Pending relocation gagal disimpan.'));
    }
  }, [pending, preview, previewItems, scannedRfidNumbers, submitSaved, submitState, targetRack]);

  const validationPassed = Boolean(
    preview?.eligible && previewItems.length === scannedRfidNumbers.length &&
    previewItems.length > 0 && previewItems.every(item => item.eligible),
  );
  const summary = useMemo(() => summarizeRelocation(previewItems), [previewItems]);
  const targetLabel = targetRack ? `${targetRack.code} · ${targetRack.name}` : 'Belum dipilih';

  return (
    <Screen scroll contentStyle={styles.screen}>
      <View style={styles.header}>
        <View style={styles.headerMain}>
          <Text style={styles.title}>Relocation</Text>
          <Text style={styles.subtitle}>Pindahkan barang placed ke rak active lain.</Text>
        </View>
        <Badge label={`${scannedRfidNumbers.length} RFID`} variant="accent" />
      </View>

      {pending ? (
        <Card tone="danger" style={styles.card}>
          <Text style={styles.cardTitle}>Relocation masih tertunda</Text>
          <Text style={styles.helper}>Request ID yang sama akan digunakan sampai backend mengonfirmasi hasilnya.</Text>
          <Text style={styles.requestId}>{pending.clientRequestId}</Text>
          <Button label={submitState === 'loading' ? 'Mengirim…' : 'Coba lagi'} loading={submitState === 'loading'} onPress={() => void submitSaved(pending)} disabled={submitState === 'loading'} style={styles.buttonTop} />
        </Card>
      ) : null}

      {blockedByPlacement && !pending ? (
        <Card tone="danger" style={styles.card}>
          <Text style={styles.cardTitle}>Ada placement yang masih tertunda</Text>
          <Text style={styles.helper}>Selesaikan atau ulangi placement tersebut terlebih dahulu agar tidak membuat submission baru.</Text>
        </Card>
      ) : null}

      {successText ? <Card tone="accent" style={styles.card}><Text style={styles.successTitle}>Relocation berhasil</Text><Text style={styles.successText}>{successText}</Text></Card> : null}
      {error ? <Card tone="danger" style={styles.card}><Text style={styles.errorTitle}>Perlu perhatian</Text><Text style={styles.errorText}>{error}</Text></Card> : null}

      <Card style={styles.card}>
        <View style={styles.cardHeaderRow}>
          <View style={styles.itemMain}><Text style={styles.cardTitle}>1. Pilih rak tujuan</Text><Text style={styles.helper}>Rak tujuan harus active dan berbeda dari rak asal.</Text></View>
          <Pressable onPress={() => void loadRacks()} disabled={loadingRacks || Boolean(pending)} style={styles.refreshButton}><Text style={styles.refreshText}>{loadingRacks ? 'Memuat…' : 'Refresh'}</Text></Pressable>
        </View>
        {racks.length === 0 ? <Text style={styles.emptyRack}>{loadingRacks ? 'Memuat daftar rak…' : 'Tidak ada rak active.'}</Text> : racks.map(rack => {
          const active = targetRack?.id === rack.id;
          const disabled = Boolean(pending) || blockedByPlacement || scannedRfidNumbers.length > 0;
          return <Pressable key={rack.id} onPress={() => { setTargetRack(rack); setPreview(null); setPreviewItems([]); setError(undefined); }} disabled={disabled} accessibilityState={{ disabled, selected: active }} style={[styles.rackRow, active && styles.rackRowActive, disabled && styles.rackRowDisabled]}>
            <View style={styles.itemMain}><Text style={[styles.rackCode, active && styles.activeText]}>{rack.code}</Text><Text style={styles.itemNote}>{rack.name}</Text>{rack.description ? <Text style={styles.itemNote}>{rack.description}</Text> : null}</View>
            {active ? <Badge label="TUJUAN" variant="accent" /> : null}
          </Pressable>;
        })}
      </Card>

      <Card style={styles.card}>
        <Text style={styles.cardTitle}>2. Scan RFID dari rak asal</Text>
        <Text style={styles.helper}>Pilih tujuan terlebih dahulu. RFID duplicate otomatis diabaikan.</Text>
        {settings.readerMode === 'sdk' ? <Button label={reader.reading ? 'Stop scan' : 'Mulai scan'} variant={reader.reading ? 'danger' : 'primary'} compact onPress={() => void (reader.reading ? reader.stop() : reader.start())} disabled={!targetRack || Boolean(pending) || blockedByPlacement} style={styles.buttonTop} /> : null}
        <Text style={styles.readerStatus}>{settings.readerMode === 'sdk' ? reader.status.message : 'Mode reader simulasi aktif.'}</Text>
        <View style={styles.manualRow}>
          <TextInput value={manualRfid} onChangeText={setManualRfid} onSubmitEditing={() => { addRfid(manualRfid); setManualRfid(''); }} placeholder="Masukkan RFID manual" placeholderTextColor={colors.faint} autoCapitalize="characters" style={styles.input} editable={Boolean(targetRack) && !pending && !blockedByPlacement} returnKeyType="done" />
          <Button label="Tambah" compact variant="secondary" onPress={() => { addRfid(manualRfid); setManualRfid(''); }} disabled={!targetRack || Boolean(pending) || blockedByPlacement || !manualRfid.trim()} />
        </View>
      </Card>

      <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>RFID terbaca</Text><Text style={styles.sectionCount}>{scannedRfidNumbers.length} barang</Text></View>
      {scannedRfidNumbers.length === 0 ? <EmptyState title="Belum ada RFID" description="Scan RFID dari satu atau beberapa rak asal." /> : <Card style={styles.card}>{scannedRfidNumbers.map((rfid, index) => {
        const item = previewItems.find(row => row.rfid_number === rfid);
        return <View key={rfid} style={[styles.rfidRow, index > 0 && styles.divider]}><View style={styles.itemMain}><Text style={styles.rfid}>{rfid}</Text>{item?.product_name ? <Text style={styles.itemNote}>{item.product_name}</Text> : null}{item && !item.eligible ? <Text style={styles.itemError}>{previewItemMessage(item) ?? 'RFID tidak eligible.'}</Text> : null}{item?.eligible ? <Text style={styles.itemEligible}>Eligible · {rackLabel(item.current_rack)}</Text> : null}</View><Pressable onPress={() => removeRfid(rfid)} style={styles.removeButton} accessibilityLabel={`Hapus ${rfid}`}><Text style={styles.removeText}>Hapus</Text></Pressable></View>;
      })}</Card>}

      <Button label={validating ? 'Memuat preview…' : 'Preview relocation'} loading={validating} onPress={() => void validate()} disabled={!targetRack || scannedRfidNumbers.length === 0 || validating || Boolean(pending) || blockedByPlacement} style={styles.buttonBottom} />

      {preview ? <Card style={styles.card}>
        <Text style={styles.cardTitle}>3. Review relocation</Text>
        <Text style={styles.reviewTotal}>{previewItems.length} RFID · Tujuan: {preview.target_rack ? rackLabel(preview.target_rack) : targetLabel}</Text>
        {previewItems.map(item => <View key={item.rfid_number} style={styles.detailRow}><View style={styles.itemMain}><Text style={styles.rfid}>{item.rfid_number}</Text><Text style={styles.itemNote}>Pack {item.pack_number ?? '-'} · {item.sku ?? 'SKU tidak tersedia'}</Text><Text style={styles.itemNote}>{item.product_name ?? 'Produk tidak tersedia'} · {item.units ?? '-'} {item.base_unit ?? 'unit'} · {expiryLabel(item.expires_on)}</Text><Text style={item.eligible ? styles.itemEligible : styles.itemError}>{item.eligible ? `Eligible · ${rackLabel(item.current_rack)} → ${rackLabel(item.target_rack ?? preview.target_rack)}` : previewItemMessage(item) ?? 'Tidak eligible'}</Text></View></View>)}
        <View style={styles.summaryBox}><Text style={styles.summaryTitle}>Summary per rak asal</Text>{summary.byRack.map(row => <Text key={row.source} style={styles.summaryText}>{row.source} → {targetLabel}: {row.count} item</Text>)}<Text style={[styles.summaryTitle, styles.summarySpacing]}>Summary per produk</Text>{summary.byProduct.map(row => <Text key={row.product} style={styles.summaryText}>{row.product}: {row.count} pack</Text>)}</View>
      </Card> : null}

      <Button label={submitState === 'loading' ? 'Mengirim relocation…' : 'Konfirmasi & submit relocation'} loading={submitState === 'loading'} onPress={() => void submit()} disabled={!validationPassed || !targetRack || Boolean(pending) || blockedByPlacement || submitState === 'loading'} style={styles.submitButton} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.lg },
  headerMain: { flex: 1 },
  title: { ...type.title, color: colors.text },
  subtitle: { ...type.small, color: colors.muted, marginTop: spacing.xs },
  card: { marginBottom: spacing.md },
  cardTitle: { ...type.h2, color: colors.text },
  helper: { ...type.tiny, color: colors.muted, marginTop: spacing.xs, textTransform: 'none', letterSpacing: 0, lineHeight: 17 },
  buttonTop: { marginTop: spacing.md },
  buttonBottom: { marginBottom: spacing.md },
  readerStatus: { ...type.tiny, color: colors.faint, marginTop: spacing.sm, textTransform: 'none', letterSpacing: 0 },
  manualRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center', marginTop: spacing.md },
  input: { flex: 1, minHeight: 44, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, color: colors.text, paddingHorizontal: spacing.md, ...type.small },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  sectionTitle: { ...type.h2, color: colors.text },
  sectionCount: { ...type.tiny, color: colors.accent, textTransform: 'none', letterSpacing: 0 },
  rfidRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.md },
  detailRow: { borderTopWidth: 1, borderTopColor: colors.border, paddingVertical: spacing.md },
  divider: { borderTopWidth: 1, borderTopColor: colors.border },
  itemMain: { flex: 1 },
  rfid: { ...type.small, color: colors.text, fontFamily: fonts.mono },
  itemNote: { ...type.tiny, color: colors.muted, marginTop: 3, textTransform: 'none', letterSpacing: 0, lineHeight: 16 },
  itemEligible: { ...type.tiny, color: colors.new, marginTop: 4, textTransform: 'none', letterSpacing: 0, lineHeight: 16 },
  itemError: { ...type.tiny, color: colors.danger, marginTop: 4, textTransform: 'none', letterSpacing: 0, lineHeight: 16 },
  removeButton: { padding: spacing.sm },
  removeText: { ...type.small, color: colors.danger, fontWeight: '700' },
  cardHeaderRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  refreshButton: { padding: spacing.xs },
  refreshText: { ...type.small, color: colors.accent, fontWeight: '700' },
  emptyRack: { ...type.small, color: colors.faint, marginTop: spacing.md },
  rackRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, marginTop: spacing.sm },
  rackRowActive: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  rackRowDisabled: { opacity: 0.45 },
  rackCode: { ...type.body, color: colors.text, fontWeight: '700' },
  activeText: { color: colors.accent },
  reviewTotal: { ...type.small, color: colors.accent, marginTop: spacing.md },
  summaryBox: { marginTop: spacing.md, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.surfaceAlt },
  summaryTitle: { ...type.small, color: colors.text, fontWeight: '700' },
  summarySpacing: { marginTop: spacing.md },
  summaryText: { ...type.tiny, color: colors.muted, marginTop: spacing.xs, textTransform: 'none', letterSpacing: 0 },
  submitButton: { marginBottom: spacing.xl },
  requestId: { ...type.tiny, color: colors.faint, fontFamily: fonts.mono, marginTop: spacing.sm, textTransform: 'none', letterSpacing: 0 },
  successTitle: { ...type.h2, color: colors.new },
  successText: { ...type.small, color: colors.text, marginTop: spacing.xs },
  errorTitle: { ...type.h2, color: colors.danger },
  errorText: { ...type.small, color: colors.text, marginTop: spacing.xs, lineHeight: 19 },
});
