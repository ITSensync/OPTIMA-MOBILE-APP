import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useIsFocused } from '@react-navigation/native';

import {
  createPlacement,
  fetchActiveRacks,
  isInitialPlacementSuccess,
  isReusableSuccess,
  PlacementTimeoutError,
  previewPlacement,
  type PreviewData,
  type PreviewItem,
  type Rack,
} from '../api/placementApi';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { EmptyState } from '../components/EmptyState';
import { useUhfReader } from '../reader/useUhfReader';
import { playScanFeedback } from '../reader/scanFeedback';
import { Screen } from '../components/Screen';
import { useSettings } from '../state/SettingsProvider';
import {
  clearPendingPlacementSubmission,
  getPendingPlacementSubmission,
  savePendingPlacementSubmission,
  type PendingPlacementSubmission,
} from '../storage/placementSubmissionRepo';
import { localDateTime } from '../domain/datetime';
import { errorMessage as placementErrorMessage, previewItemMessage } from '../domain/placementErrors';
import { colors, fonts, radius, spacing, type } from '../theme';
import { getPendingRelocationSubmission } from '../storage/relocationSubmissionRepo';

type SubmitState = 'idle' | 'loading' | 'success' | 'error';

function errorMessage(error: unknown): string {
  return placementErrorMessage(error, 'Placement gagal diproses.');
}

function rfidKey(value: string): string {
  return value.trim().toUpperCase();
}

function clientRequestId(): string {
  const random = () => Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, '0');
  return `MOBILE-${random()}-${random()}-${Date.now().toString(16)}`;
}

export function PlacementScreen() {
  const focused = useIsFocused();
  const { settings } = useSettings();
  const [scannedRfidNumbers, setScannedRfidNumbers] = useState<string[]>([]);
  const [validatedItems, setValidatedItems] = useState<PreviewItem[]>([]);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [racks, setRacks] = useState<Rack[]>([]);
  const [selectedRack, setSelectedRack] = useState<Rack | null>(null);
  const [loadingRacks, setLoadingRacks] = useState(false);
  const [validating, setValidating] = useState(false);
  const [submitState, setSubmitState] = useState<SubmitState>('idle');
  const [error, setError] = useState<string>();
  const [successText, setSuccessText] = useState<string>();
  const [pending, setPending] = useState<PendingPlacementSubmission | null>(null);
  const [blockedByRelocation, setBlockedByRelocation] = useState(false);
  const autoRetried = useRef(false);
  const scannedRfidKeys = useRef(new Set<string>());

  const loadRacks = useCallback(async () => {
    setLoadingRacks(true);
    try {
      const nextRacks = await fetchActiveRacks();
      setRacks(nextRacks);
      setSelectedRack(current =>
        current && nextRacks.some(rack => rack.id === current.id) ? current : null,
      );
    } catch (loadError) {
      setError(errorMessage(loadError));
    } finally {
      setLoadingRacks(false);
    }
  }, []);

  const addRfid = useCallback(
    (raw: string) => {
      const value = raw.trim();
      if (!value) return;
      const key = rfidKey(value);
      if (scannedRfidKeys.current.has(key)) return;
      scannedRfidKeys.current.add(key);
      playScanFeedback(settings.haptics);
      setScannedRfidNumbers(current => [...current, value]);
      setPreview(null);
      setValidatedItems([]);
      setSelectedRack(null);
      setError(undefined);
      setSuccessText(undefined);
    },
    [settings.haptics],
  );

  const onTag = useCallback((event: { epc: string; at: number }) => {
    addRfid(event.epc);
  }, [addRfid]);

  const reader = useUhfReader({
    enabled: focused && settings.readerMode === 'sdk' && !pending && !blockedByRelocation,
    onTag,
  });

  const validate = useCallback(async () => {
    if (scannedRfidNumbers.length === 0) return;
    setSelectedRack(null);
    setValidating(true);
    setError(undefined);
    try {
      const result = await previewPlacement(scannedRfidNumbers);
      setPreview(result);
      setValidatedItems(result.items);
      if (!result.eligible) {
        setError('Ada RFID yang belum dapat ditempatkan. Periksa detail di bawah.');
      }
    } catch (validationError) {
      setError(errorMessage(validationError));
    } finally {
      setValidating(false);
    }
  }, [scannedRfidNumbers]);

  const submitSaved = useCallback(async (submission: PendingPlacementSubmission) => {
    setSubmitState('loading');
    setError(undefined);
    try {
      let result;
      try {
        result = await createPlacement(
          submission.rackId,
          submission.rfidNumbers,
          submission.clientRequestId,
        );
      } catch (firstError) {
        if (!(firstError instanceof PlacementTimeoutError)) throw firstError;
        result = await createPlacement(
          submission.rackId,
          submission.rfidNumbers,
          submission.clientRequestId,
        );
      }

      if (!isInitialPlacementSuccess(result.status) && !isReusableSuccess(result.status, result.data)) {
        throw new Error('Response placement belum dikonfirmasi oleh backend.');
      }

      await clearPendingPlacementSubmission();
      setPending(null);
      setSubmitState('success');
      scannedRfidKeys.current.clear();
      setScannedRfidNumbers([]);
      setValidatedItems([]);
      setPreview(null);
      setSelectedRack(null);
      setSuccessText(
        `${result.data.total_placed ?? submission.rfidNumbers.length} barang berhasil ditempatkan${
          result.data.placed_at ? ` pada ${localDateTime(result.data.placed_at)}` : '.'
        }`,
      );
    } catch (submitError) {
      setPending(submission);
      setSubmitState('error');
      setError(errorMessage(submitError));
    }
  }, []);

  useEffect(() => {
    void loadRacks();
    void Promise.all([getPendingPlacementSubmission(), getPendingRelocationSubmission()]).then(([saved, relocation]) => {
      setBlockedByRelocation(Boolean(relocation));
      if (!saved) return;
      setPending(saved);
      scannedRfidKeys.current = new Set(saved.rfidNumbers.map(rfidKey));
      setScannedRfidNumbers(saved.rfidNumbers);
      if (!autoRetried.current) {
        autoRetried.current = true;
        void submitSaved(saved);
      }
    });
  }, [loadRacks, submitSaved]);

  useEffect(() => {
    if (!focused) return;
    void getPendingRelocationSubmission().then(relocation => {
      setBlockedByRelocation(Boolean(relocation));
    });
  }, [focused]);

  const submit = useCallback(async () => {
    if (
      !selectedRack ||
      !preview ||
      !preview.eligible ||
      validatedItems.length !== scannedRfidNumbers.length ||
      validatedItems.some(item => !item.eligible)
    ) {
      setError('Validasi RFID dan pilih rak active sebelum submit.');
      return;
    }
    const submission: PendingPlacementSubmission = {
      rackId: selectedRack.id,
      rfidNumbers: [...scannedRfidNumbers],
      clientRequestId: clientRequestId(),
      createdAt: new Date().toISOString(),
    };
    try {
      await savePendingPlacementSubmission(submission);
      setPending(submission);
      await submitSaved(submission);
    } catch (saveError) {
      setSubmitState('error');
      setError(errorMessage(saveError));
    }
  }, [preview, scannedRfidNumbers, selectedRack, submitSaved, validatedItems]);

  const removeRfid = useCallback((rfid: string) => {
    scannedRfidKeys.current.delete(rfidKey(rfid));
    setScannedRfidNumbers(current => current.filter(item => item !== rfid));
    setValidatedItems(current => current.filter(item => item.rfid_number !== rfid));
    setPreview(null);
    setSelectedRack(null);
    setError(undefined);
  }, []);

  const validationPassed = Boolean(
    preview?.eligible &&
      validatedItems.length === scannedRfidNumbers.length &&
      scannedRfidNumbers.length > 0 &&
      validatedItems.every(item => item.eligible),
  );

  const rackSelectionEnabled = validationPassed && !pending && !validating && !blockedByRelocation;

  const canSubmit = Boolean(
    scannedRfidNumbers.length > 0 &&
      selectedRack &&
      validationPassed &&
      submitState !== 'loading' &&
      !pending &&
      !blockedByRelocation,
  );

  const allScannedValidated = useMemo(
    () => validationPassed,
    [validationPassed],
  );

  return (
    <Screen scroll contentStyle={styles.screen}>
      <View style={styles.header}>
        <View style={styles.headerMain}>
          <Text style={styles.title}>Placement</Text>
          <Text style={styles.subtitle}>Tempatkan hasil repacking ke rak active.</Text>
        </View>
        <Badge label={`${scannedRfidNumbers.length} RFID`} variant="accent" />
      </View>

      {blockedByRelocation && !pending ? (
        <Card tone="danger" style={styles.card}>
          <Text style={styles.cardTitle}>Ada relocation yang masih tertunda</Text>
          <Text style={styles.helper}>Selesaikan atau ulangi relocation tersebut terlebih dahulu agar tidak membuat submission baru.</Text>
        </Card>
      ) : null}

      {pending ? (
        <Card tone="danger" style={styles.card}>
          <Text style={styles.cardTitle}>Submission masih tertunda</Text>
          <Text style={styles.helper}>
            Request ID yang sama akan digunakan sampai backend mengonfirmasi hasilnya.
          </Text>
          <Text style={styles.requestId}>{pending.clientRequestId}</Text>
          <Button
            label={submitState === 'loading' ? 'Mengirim…' : 'Coba lagi'}
            loading={submitState === 'loading'}
            onPress={() => void submitSaved(pending)}
            disabled={submitState === 'loading'}
            style={styles.buttonTop}
          />
        </Card>
      ) : null}

      {successText ? (
        <Card tone="accent" style={styles.card}>
          <Text style={styles.successTitle}>Placement berhasil</Text>
          <Text style={styles.successText}>{successText}</Text>
        </Card>
      ) : null}

      {error ? (
        <Card tone="danger" style={styles.card}>
          <Text style={styles.errorTitle}>Perlu perhatian</Text>
          <Text style={styles.errorText}>{error}</Text>
        </Card>
      ) : null}

      <Card style={styles.card}>
        <Text style={styles.cardTitle}>Scan RFID</Text>
        <Text style={styles.helper}>Gunakan tombol fisik atau reader UHF handheld.</Text>
        {settings.readerMode === 'sdk' ? (
          <Button
            label={reader.reading ? 'Stop scan' : 'Mulai scan'}
            variant={reader.reading ? 'danger' : 'primary'}
            compact
            onPress={() => void (reader.reading ? reader.stop() : reader.start())}
            disabled={Boolean(pending) || blockedByRelocation}
            style={styles.buttonTop}
          />
        ) : null}
        <Text style={styles.readerStatus}>
          {settings.readerMode === 'sdk' ? reader.status.message : 'Mode reader simulasi aktif.'}
        </Text>
      </Card>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>RFID terbaca</Text>
        <Text style={styles.sectionCount}>{scannedRfidNumbers.length} barang</Text>
      </View>
      {scannedRfidNumbers.length === 0 ? (
        <EmptyState title="Belum ada RFID" description="Hasil scan akan tampil di sini." />
      ) : (
        <Card style={styles.card}>
          {scannedRfidNumbers.map((rfid, index) => {
            const item = validatedItems.find(row => row.rfid_number === rfid);
            return (
              <View key={rfid} style={[styles.rfidRow, index > 0 && styles.divider]}>
                <View style={styles.itemMain}>
                  <Text style={styles.rfid}>{rfid}</Text>
                  {item?.product_name ? <Text style={styles.itemNote}>{item.product_name}</Text> : null}
                  {item?.sku ? <Text style={styles.itemNote}>SKU: {item.sku}</Text> : null}
                  {item && !item.eligible ? <Text style={styles.itemError}>{previewItemMessage(item) ?? 'RFID tidak eligible.'}</Text> : null}
                  {item?.eligible ? <Text style={styles.itemEligible}>Eligible</Text> : null}
                </View>
                <Pressable onPress={() => removeRfid(rfid)} style={styles.removeButton} accessibilityLabel={`Hapus ${rfid}`}>
                  <Text style={styles.removeText}>Hapus</Text>
                </Pressable>
              </View>
            );
          })}
        </Card>
      )}

      <Button
        label={validating ? 'Memvalidasi…' : 'Validasi RFID'}
        loading={validating}
        onPress={() => void validate()}
        disabled={Boolean(pending) || blockedByRelocation || scannedRfidNumbers.length === 0 || validating}
        style={styles.buttonBottom}
      />

      <Card style={styles.card}>
        <View style={styles.cardHeaderRow}>
          <View style={styles.itemMain}>
            <Text style={styles.cardTitle}>Pilih rak active</Text>
            <Text style={styles.helper}>
              {rackSelectionEnabled
                ? 'Rak dikelola Admin web dan hanya dibaca dari backend.'
                : 'Validasi semua RFID terlebih dahulu untuk memilih rak.'}
            </Text>
          </View>
          <Pressable onPress={() => void loadRacks()} disabled={loadingRacks} style={styles.refreshButton}>
            <Text style={styles.refreshText}>{loadingRacks ? 'Memuat…' : 'Refresh'}</Text>
          </Pressable>
        </View>
        {racks.length === 0 ? (
          <Text style={styles.emptyRack}>{loadingRacks ? 'Memuat daftar rak…' : 'Tidak ada rak active.'}</Text>
        ) : racks.map(rack => {
          const active = selectedRack?.id === rack.id;
          return (
            <Pressable
              key={rack.id}
              onPress={() => setSelectedRack(rack)}
              disabled={!rackSelectionEnabled}
              accessibilityState={{ disabled: !rackSelectionEnabled, selected: active }}
              style={[styles.rackRow, active && styles.rackRowActive, !rackSelectionEnabled && styles.rackRowDisabled]}
            >
              <View style={styles.itemMain}>
                <Text style={[styles.rackCode, active && styles.activeText]}>{rack.code}</Text>
                <Text style={styles.itemNote}>{rack.name}</Text>
                {rack.description ? <Text style={styles.itemNote}>{rack.description}</Text> : null}
              </View>
              {active && rackSelectionEnabled ? <Badge label="DIPILIH" variant="accent" /> : null}
            </Pressable>
          );
        })}
      </Card>

      {allScannedValidated ? (
        <Card style={styles.card}>
          <Text style={styles.cardTitle}>Review placement</Text>
          <Text style={styles.reviewTotal}>{scannedRfidNumbers.length} barang</Text>
          <Text style={styles.helper}>
            Tujuan: {selectedRack ? `${selectedRack.code} · ${selectedRack.name}` : 'Belum dipilih'}
          </Text>
          <Text style={styles.helper}>Backend akan mengubah status setelah submit berhasil.</Text>
        </Card>
      ) : null}

      <Button
        label={submitState === 'loading' ? 'Mengirim placement…' : 'Submit placement'}
        loading={submitState === 'loading'}
        onPress={() => void submit()}
        disabled={!canSubmit}
        style={styles.submitButton}
      />
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
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  sectionTitle: { ...type.h2, color: colors.text },
  sectionCount: { ...type.tiny, color: colors.accent, textTransform: 'none', letterSpacing: 0 },
  rfidRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.md },
  divider: { borderTopWidth: 1, borderTopColor: colors.border },
  itemMain: { flex: 1 },
  rfid: { ...type.small, color: colors.text, fontFamily: fonts.mono },
  itemNote: { ...type.tiny, color: colors.muted, marginTop: 3, textTransform: 'none', letterSpacing: 0 },
  itemEligible: { ...type.tiny, color: colors.new, marginTop: 4, textTransform: 'none', letterSpacing: 0 },
  itemError: { ...type.tiny, color: colors.danger, marginTop: 4, textTransform: 'none', letterSpacing: 0 },
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
  reviewTotal: { ...type.title, color: colors.accent, marginTop: spacing.md },
  submitButton: { marginBottom: spacing.xl },
  requestId: { ...type.tiny, color: colors.faint, fontFamily: fonts.mono, marginTop: spacing.sm, textTransform: 'none', letterSpacing: 0 },
  successTitle: { ...type.h2, color: colors.new },
  successText: { ...type.small, color: colors.text, marginTop: spacing.xs },
  errorTitle: { ...type.h2, color: colors.danger },
  errorText: { ...type.small, color: colors.text, marginTop: spacing.xs, lineHeight: 19 },
});
