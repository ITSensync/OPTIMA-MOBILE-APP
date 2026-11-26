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
import { useIsFocused } from '@react-navigation/native';

import {
  createStocktake,
  fetchStocktake,
  fetchStocktakeSessions,
  sendStocktakeScans,
  submitStocktake,
  PlacementTimeoutError,
  type PendingStocktakeScan,
  type RejectedStocktakeScan,
  type StocktakeItem,
  type StocktakeReport,
  type StocktakeScanResult,
  type StocktakeSession,
} from '../api/stocktakeApi';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { EmptyState } from '../components/EmptyState';
import { Screen } from '../components/Screen';
import { localDateTime } from '../domain/datetime';
import { BUSINESS_MESSAGES, errorMessage } from '../domain/placementErrors';
import {
  stocktakeItemLocation,
  stocktakeRackLabel,
  stocktakeResultLabel,
  stocktakeStatusLabel,
} from '../domain/stocktake';
import { playScanFeedback } from '../reader/scanFeedback';
import { useUhfReader } from '../reader/useUhfReader';
import { useSettings } from '../state/SettingsProvider';
import {
  clearPendingStocktakeScan,
  getPendingStocktakeScan,
  savePendingStocktakeScan,
} from '../storage/stocktakeRepo';
import { colors, fonts, radius, spacing, type } from '../theme';

type SubmitState = 'idle' | 'loading' | 'success' | 'error';

function rfidKey(value: string): string {
  return value.trim().toUpperCase();
}

function requestId(): string {
  const cryptoApi = (globalThis as { crypto?: { randomUUID?: () => string } })
    .crypto;
  if (cryptoApi?.randomUUID) return cryptoApi.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, character => {
    const random = Math.floor(Math.random() * 16);
    const value = character === 'x' ? random : Math.floor(random / 4) + 8;
    return value.toString(16);
  });
}

function statusVariant(status?: string): 'new' | 'old' | 'neutral' | 'danger' {
  if (status === 'draft') return 'old';
  if (status === 'submitted') return 'new';
  if (status === 'cancelled') return 'danger';
  return 'neutral';
}

function rejectedMessage(scan: RejectedStocktakeScan): string {
  const code = scan.error_code ?? scan.code;
  if (code === 'RFID_NOT_PLACED')
    return 'RFID belum melalui placement dan belum dapat diopname.';
  if (code === 'RFID_LOCATION_NOT_FOUND')
    return 'RFID placed tetapi lokasi rak tidak ditemukan.';
  return (
    (code ? BUSINESS_MESSAGES[code] : undefined) ??
    scan.message ??
    'RFID ditolak oleh backend.'
  );
}

function scanResultMessage(result: StocktakeScanResult): string {
  const code = result.error_code ?? result.code;
  return (
    (code ? BUSINESS_MESSAGES[code] : undefined) ??
    result.message ??
    'RFID ditolak oleh backend.'
  );
}

function reportItems(report: StocktakeReport): StocktakeItem[] {
  return report.racks.flatMap(rackGroup => rackGroup.items);
}

function resultVariant(result?: string): 'new' | 'old' | 'neutral' | 'danger' {
  if (result === 'matched') return 'new';
  if (result === 'missing' || result === 'pending') return 'old';
  if (result === 'lifecycle_changed') return 'danger';
  return 'neutral';
}

function displayDate(value?: string | null): string {
  return value ? localDateTime(value) : '-';
}

export function StocktakeScreen() {
  const focused = useIsFocused();
  const { settings } = useSettings();
  const [sessions, setSessions] = useState<StocktakeSession[]>([]);
  const [activeReport, setActiveReport] = useState<StocktakeReport | null>(
    null,
  );
  const [lastScanResults, setLastScanResults] = useState<StocktakeScanResult[]>(
    [],
  );
  const [scannedRfidNumbers, setScannedRfidNumbers] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const [manualRfid, setManualRfid] = useState('');
  const [expandedRacks, setExpandedRacks] = useState<Record<string, boolean>>(
    {},
  );
  const [pending, setPending] = useState<PendingStocktakeScan | null>(null);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [loadingReport, setLoadingReport] = useState(false);
  const [creating, setCreating] = useState(false);
  const [processingScan, setProcessingScan] = useState(false);
  const [submitState, setSubmitState] = useState<SubmitState>('idle');
  const [error, setError] = useState<string>();
  const [successText, setSuccessText] = useState<string>();
  const scannedKeys = useRef(new Set<string>());
  const autoRetried = useRef(false);

  const activeSession = activeReport?.session ?? null;
  const isDraft = activeSession?.status === 'draft';
  const counts = useMemo(() => {
    if (!activeReport) {
      return {
        sesuai: 0,
        ekspektasi: 0,
        belumTerbaca: 0,
        lifecycleBerubah: 0,
        scanDitolak: 0,
      };
    }
    const items = reportItems(activeReport);
    return {
      sesuai: activeReport.summary.scanned_count,
      ekspektasi: activeReport.summary.expected_count,
      belumTerbaca:
        activeReport.session.status === 'draft'
          ? items.filter(item => item.result === 'pending').length
          : activeReport.summary.missing_count,
      lifecycleBerubah: activeReport.summary.changed_count,
      scanDitolak: activeReport.summary.rejected_count,
    };
  }, [activeReport]);

  const loadSessions = useCallback(async () => {
    setLoadingSessions(true);
    try {
      setSessions(await fetchStocktakeSessions());
    } catch (loadError) {
      setError(errorMessage(loadError, 'Daftar sesi opname gagal dimuat.'));
    } finally {
      setLoadingSessions(false);
    }
  }, []);

  const openSession = useCallback(async (session: StocktakeSession) => {
    setLoadingReport(true);
    setError(undefined);
    setSuccessText(undefined);
    try {
      const report = await fetchStocktake(session.id);
      setActiveReport(report);
      setLastScanResults([]);
      setExpandedRacks({});
      setScannedRfidNumbers([]);
      scannedKeys.current.clear();
    } catch (loadError) {
      setError(errorMessage(loadError, 'Detail sesi opname gagal dimuat.'));
    } finally {
      setLoadingReport(false);
    }
  }, []);

  const addRfid = useCallback(
    (raw: string) => {
      if (!isDraft || pending) return;
      const value = raw.trim();
      if (!value) return;
      const key = rfidKey(value);
      if (scannedKeys.current.has(key)) {
        setError('RFID yang sama sudah ada di buffer scan.');
        return;
      }
      scannedKeys.current.add(key);
      playScanFeedback(settings.haptics);
      setScannedRfidNumbers(current => [...current, value]);
      setError(undefined);
      setSuccessText(undefined);
    },
    [isDraft, pending, settings.haptics],
  );

  const onTag = useCallback(
    (event: { epc: string; at: number }) => {
      addRfid(event.epc);
    },
    [addRfid],
  );

  const reader = useUhfReader({
    enabled:
      focused &&
      Boolean(activeReport) &&
      isDraft &&
      !pending &&
      !processingScan,
    onTag,
  });

  const sendSavedScan = useCallback(
    async (submission: PendingStocktakeScan) => {
      setProcessingScan(true);
      setError(undefined);
      try {
        let result;
        try {
          result = await sendStocktakeScans(
            submission.stocktakeSessionId,
            submission.rfidNumbers,
            submission.clientRequestId,
          );
        } catch (firstError) {
          if (!(firstError instanceof PlacementTimeoutError)) throw firstError;
          result = await sendStocktakeScans(
            submission.stocktakeSessionId,
            submission.rfidNumbers,
            submission.clientRequestId,
          );
        }

        await clearPendingStocktakeScan();
        setPending(null);
        setActiveReport(result.report);
        setLastScanResults(result.results);
        setScannedRfidNumbers([]);
        scannedKeys.current.clear();
        setSubmitState('success');
        const rejectedCount =
          result.results.length > 0
            ? result.results.filter(item => !item.accepted).length
            : result.report.rejected_scans.filter(scan =>
                submission.rfidNumbers.some(
                  rfid => rfidKey(rfid) === rfidKey(scan.rfid_number),
                ),
              ).length;
        const acceptedCount =
          result.results.length > 0
            ? result.results.filter(item => item.accepted).length
            : Math.max(0, submission.rfidNumbers.length - rejectedCount);
        setSuccessText(
          rejectedCount > 0
            ? `${acceptedCount} RFID diterima, ${rejectedCount} RFID ditolak. Periksa bagian Scan ditolak.`
            : `${submission.rfidNumbers.length} RFID berhasil diproses.`,
        );
        if (
          rejectedCount === submission.rfidNumbers.length &&
          rejectedCount > 0
        ) {
          setError(
            'Semua RFID pada batch ini ditolak. Detail penolakan tersedia di bawah.',
          );
        }
      } catch (scanError) {
        setPending(submission);
        setSubmitState('error');
        setError(errorMessage(scanError, 'Batch scan opname gagal diproses.'));
      } finally {
        setProcessingScan(false);
      }
    },
    [],
  );

  const createSession = useCallback(async () => {
    if (creating || pending) return;
    setCreating(true);
    setError(undefined);
    setSuccessText(undefined);
    try {
      const created = await createStocktake(notes);
      let report = created;
      if (created.session.id) {
        try {
          report = await fetchStocktake(created.session.id);
        } catch {
          // The create response remains usable while the detail endpoint is unavailable.
        }
      }
      if (!report.session.id)
        throw new Error('Backend tidak mengembalikan ID sesi opname.');
      setActiveReport(report);
      setLastScanResults([]);
      setNotes('');
      setExpandedRacks({});
      setSubmitState('idle');
      await loadSessions();
    } catch (createError) {
      setError(errorMessage(createError, 'Sesi opname gagal dibuat.'));
    } finally {
      setCreating(false);
    }
  }, [creating, loadSessions, notes, pending]);

  const processScan = useCallback(async () => {
    if (
      !activeSession ||
      !isDraft ||
      scannedRfidNumbers.length === 0 ||
      pending ||
      processingScan
    ) {
      return;
    }
    const submission: PendingStocktakeScan = {
      stocktakeSessionId: activeSession.id,
      clientRequestId: requestId(),
      rfidNumbers: [...scannedRfidNumbers],
      createdAt: new Date().toISOString(),
    };
    try {
      await savePendingStocktakeScan(submission);
      setPending(submission);
      await sendSavedScan(submission);
    } catch (saveError) {
      setSubmitState('error');
      setError(errorMessage(saveError, 'Batch scan opname gagal disimpan.'));
    }
  }, [
    activeSession,
    isDraft,
    pending,
    processingScan,
    scannedRfidNumbers,
    sendSavedScan,
  ]);

  const submitConfirmed = useCallback(async () => {
    if (
      !activeSession ||
      !isDraft ||
      pending ||
      processingScan ||
      submitState === 'loading'
    )
      return;
    setSubmitState('loading');
    setError(undefined);
    try {
      let result;
      try {
        result = await submitStocktake(activeSession.id);
      } catch (firstError) {
        if (!(firstError instanceof PlacementTimeoutError)) throw firstError;
        result = await submitStocktake(activeSession.id);
      }
      if (result.report.session.status !== 'submitted' && !result.reused) {
        throw new Error('Response submit opname belum berstatus submitted.');
      }
      setActiveReport(result.report);
      setSubmitState('success');
      setSuccessText(
        'Laporan opname berhasil disubmit dan tidak dapat diedit lagi.',
      );
      setScannedRfidNumbers([]);
      scannedKeys.current.clear();
      await loadSessions();
    } catch (submitError) {
      setSubmitState('error');
      setError(errorMessage(submitError, 'Laporan opname gagal disubmit.'));
    }
  }, [
    activeSession,
    isDraft,
    loadSessions,
    pending,
    processingScan,
    submitState,
  ]);

  const submitReport = useCallback(() => {
    if (!activeReport || !isDraft || pending || processingScan) return;
    Alert.alert(
      'Konfirmasi submit opname',
      `Sesuai: ${counts.sesuai}\nBelum terbaca: ${counts.belumTerbaca}\nLifecycle berubah: ${counts.lifecycleBerubah}\nScan ditolak: ${counts.scanDitolak}\n\nSetelah disubmit, sesi tidak dapat diedit.`,
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Submit laporan',
          style: 'destructive',
          onPress: () => void submitConfirmed(),
        },
      ],
    );
  }, [activeReport, counts, isDraft, pending, processingScan, submitConfirmed]);

  const removeRfid = useCallback((rfid: string) => {
    scannedKeys.current.delete(rfidKey(rfid));
    setScannedRfidNumbers(current => current.filter(item => item !== rfid));
    setError(undefined);
  }, []);

  const loadPending = useCallback(async () => {
    const saved = await getPendingStocktakeScan();
    if (!saved) return;
    setPending(saved);
    scannedKeys.current = new Set(saved.rfidNumbers.map(rfidKey));
    setScannedRfidNumbers(saved.rfidNumbers);
    try {
      const report = await fetchStocktake(saved.stocktakeSessionId);
      setActiveReport(report);
      if (!autoRetried.current) {
        autoRetried.current = true;
        void sendSavedScan(saved);
      }
    } catch (loadError) {
      setError(errorMessage(loadError, 'Sesi opname pending gagal dimuat.'));
    }
  }, [sendSavedScan]);

  useEffect(() => {
    if (!focused) return;
    void loadSessions();
    void loadPending();
  }, [focused, loadPending, loadSessions]);

  const summary = activeReport?.summary;
  const rackReports = activeReport?.racks ?? [];
  const rejectedScans = activeReport?.rejected_scans ?? [];
  const bufferLabel = useMemo(
    () => `${scannedRfidNumbers.length} UID dalam buffer`,
    [scannedRfidNumbers.length],
  );

  const closeSession = useCallback(() => {
    if (pending || processingScan) return;
    setActiveReport(null);
    setLastScanResults([]);
    setScannedRfidNumbers([]);
    scannedKeys.current.clear();
    setError(undefined);
    setSuccessText(undefined);
    void loadSessions();
  }, [loadSessions, pending, processingScan]);

  if (!activeReport) {
    return (
      <Screen scroll contentStyle={styles.screen}>
        <View style={styles.header}>
          <View style={styles.headerMain}>
            <Text style={styles.title}>Opname</Text>
            <Text style={styles.subtitle}>
              Laporkan kondisi inventory tanpa mengubah stok atau rak.
            </Text>
          </View>
          <Badge label={`${sessions.length} sesi`} variant="accent" />
        </View>

        {error ? (
          <Card tone="danger" style={styles.card}>
            <Text style={styles.errorTitle}>Perlu perhatian</Text>
            <Text style={styles.errorText}>{error}</Text>
          </Card>
        ) : null}

        {pending ? (
          <Card tone="danger" style={styles.card}>
            <Text style={styles.cardTitle}>
              Batch scan opname masih pending
            </Text>
            <Text style={styles.helper}>
              Selesaikan request ini sebelum membuat batch scan baru.
            </Text>
            <Text style={styles.requestId}>{pending.clientRequestId}</Text>
            <Button
              label="Coba lagi"
              loading={processingScan}
              onPress={() => void sendSavedScan(pending)}
              disabled={processingScan}
              style={styles.buttonTop}
            />
          </Card>
        ) : null}

        <Card style={styles.card}>
          <Text style={styles.cardTitle}>Buat sesi opname</Text>
          <Text style={styles.helper}>
            Backend akan membuat snapshot RFID placed saat sesi dibuat.
          </Text>
          <TextInput
            value={notes}
            onChangeText={setNotes}
            placeholder="Catatan opsional, misalnya area gudang A"
            placeholderTextColor={colors.faint}
            style={[styles.input, styles.notesInput]}
            multiline
            editable={!creating}
          />
          <Button
            label={creating ? 'Membuat sesi…' : 'Buat sesi opname'}
            loading={creating}
            onPress={() => void createSession()}
            disabled={creating || Boolean(pending)}
            style={styles.buttonTop}
          />
        </Card>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Daftar sesi</Text>
          <Pressable
            onPress={() => void loadSessions()}
            disabled={loadingSessions}
            style={styles.refreshButton}
          >
            <Text style={styles.refreshText}>
              {loadingSessions ? 'Memuat…' : 'Refresh'}
            </Text>
          </Pressable>
        </View>
        {sessions.length === 0 ? (
          <EmptyState
            title="Belum ada sesi opname"
            description={
              loadingSessions
                ? 'Memuat daftar sesi…'
                : 'Buat sesi pertama untuk memulai opname.'
            }
          />
        ) : (
          sessions.map(session => (
            <Pressable
              key={session.id}
              onPress={() => void openSession(session)}
              disabled={loadingReport || Boolean(pending)}
              style={styles.sessionRow}
            >
              <View style={styles.itemMain}>
                <Text style={styles.sessionNumber}>
                  {session.session_number}
                </Text>
                <Text style={styles.itemNote}>
                  Tanggal: {session.session_date || '-'}
                </Text>
                {session.summary ? (
                  <Text style={styles.itemNote}>
                    {session.summary.scanned_count} terbaca /{' '}
                    {session.summary.expected_count} ekspektasi
                  </Text>
                ) : null}
              </View>
              <Badge
                label={stocktakeStatusLabel(session.status)}
                variant={statusVariant(session.status)}
              />
            </Pressable>
          ))
        )}
      </Screen>
    );
  }

  return (
    <Screen scroll contentStyle={styles.screen}>
      <View style={styles.header}>
        <View style={styles.headerMain}>
          <Pressable
            onPress={closeSession}
            disabled={Boolean(pending) || processingScan}
            style={styles.backButton}
          >
            <Text style={styles.backText}>‹ Daftar sesi</Text>
          </Pressable>
          <Text style={styles.title}>
            {activeSession?.session_number ?? 'Opname'}
          </Text>
          <Text style={styles.subtitle}>
            Dibuat: {displayDate(activeSession?.session_date)}
          </Text>
        </View>
        <Badge
          label={stocktakeStatusLabel(activeSession?.status)}
          variant={statusVariant(activeSession?.status)}
        />
      </View>

      {pending ? (
        <Card tone="danger" style={styles.card}>
          <Text style={styles.cardTitle}>Batch scan masih pending</Text>
          <Text style={styles.helper}>
            Request ID yang sama akan dipakai sampai backend mengonfirmasi
            hasilnya.
          </Text>
          <Text style={styles.requestId}>{pending.clientRequestId}</Text>
          <Button
            label={processingScan ? 'Mengirim…' : 'Coba lagi'}
            loading={processingScan}
            onPress={() => void sendSavedScan(pending)}
            disabled={processingScan}
            style={styles.buttonTop}
          />
        </Card>
      ) : null}

      {successText ? (
        <Card tone="accent" style={styles.card}>
          <Text style={styles.successTitle}>Berhasil</Text>
          <Text style={styles.successText}>{successText}</Text>
        </Card>
      ) : null}
      {error ? (
        <Card tone="danger" style={styles.card}>
          <Text style={styles.errorTitle}>Perlu perhatian</Text>
          <Text style={styles.errorText}>{error}</Text>
        </Card>
      ) : null}

      {summary ? (
        <Card style={styles.card}>
          <Text style={styles.cardTitle}>Ringkasan laporan</Text>
          <View style={styles.statGrid}>
            <Stat label="Sesuai" value={counts.sesuai} variant="new" />
            <Stat
              label="Ekspektasi"
              value={counts.ekspektasi}
              variant="accent"
            />
            <Stat
              label="Belum terbaca"
              value={counts.belumTerbaca}
              variant="old"
            />
            <Stat
              label="Lifecycle berubah"
              value={counts.lifecycleBerubah}
              variant="danger"
            />
            <Stat
              label="Scan ditolak"
              value={counts.scanDitolak}
              variant="danger"
            />
          </View>
          {summary.total_units_expected != null ? (
            <Text style={styles.helper}>
              Unit: {summary.total_units_scanned ?? 0} terbaca /{' '}
              {summary.total_units_expected} ekspektasi
            </Text>
          ) : null}
        </Card>
      ) : null}

      {lastScanResults.length > 0 ? (
        <Card style={styles.card}>
          <Text style={styles.cardTitle}>Hasil proses scan terakhir</Text>
          {lastScanResults.map(result => (
            <View key={result.rfid_number} style={styles.batchResultRow}>
              <View style={styles.itemMain}>
                <Text style={styles.rfid}>{result.rfid_number}</Text>
                {!result.accepted ? (
                  <Text style={styles.itemError}>
                    {scanResultMessage(result)}
                  </Text>
                ) : null}
              </View>
              <Badge
                label={
                  result.accepted
                    ? stocktakeResultLabel(result.result ?? 'matched')
                    : 'Ditolak'
                }
                variant={
                  result.accepted
                    ? resultVariant(result.result ?? 'matched')
                    : 'danger'
                }
              />
            </View>
          ))}
        </Card>
      ) : null}

      {isDraft ? (
        <Card style={styles.card}>
          <Text style={styles.cardTitle}>Scan RFID dari rak mana pun</Text>
          <Text style={styles.helper}>
            Rak report diambil dari current_rack backend. UID duplicate
            diabaikan.
          </Text>
          {settings.readerMode === 'sdk' ? (
            <Button
              label={reader.reading ? 'Stop scan' : 'Mulai scan'}
              variant={reader.reading ? 'danger' : 'primary'}
              compact
              onPress={() =>
                void (reader.reading ? reader.stop() : reader.start())
              }
              disabled={Boolean(pending) || processingScan}
              style={styles.buttonTop}
            />
          ) : null}
          <Text style={styles.readerStatus}>
            {settings.readerMode === 'sdk'
              ? reader.status.message
              : 'Mode reader simulasi aktif.'}
          </Text>
          <View style={styles.manualRow}>
            <TextInput
              value={manualRfid}
              onChangeText={setManualRfid}
              onSubmitEditing={() => {
                addRfid(manualRfid);
                setManualRfid('');
              }}
              placeholder="Masukkan RFID manual"
              placeholderTextColor={colors.faint}
              autoCapitalize="characters"
              style={styles.input}
              editable={!pending && !processingScan}
              returnKeyType="done"
            />
            <Button
              label="Tambah"
              compact
              variant="secondary"
              onPress={() => {
                addRfid(manualRfid);
                setManualRfid('');
              }}
              disabled={
                Boolean(pending) || processingScan || !manualRfid.trim()
              }
            />
          </View>
          <Text style={styles.bufferLabel}>{bufferLabel}</Text>
          {scannedRfidNumbers.map((rfid, index) => (
            <View
              key={rfid}
              style={[styles.rfidRow, index > 0 && styles.divider]}
            >
              <Text style={styles.rfid}>{rfid}</Text>
              <Pressable
                onPress={() => removeRfid(rfid)}
                style={styles.removeButton}
              >
                <Text style={styles.removeText}>Hapus</Text>
              </Pressable>
            </View>
          ))}
          <Button
            label={processingScan ? 'Memvalidasi…' : 'Validasi opname'}
            loading={processingScan}
            onPress={() => void processScan()}
            disabled={
              Boolean(pending) ||
              processingScan ||
              scannedRfidNumbers.length === 0
            }
            style={styles.buttonTop}
          />
        </Card>
      ) : null}

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Hasil per rak</Text>
        <Text style={styles.sectionCount}>{rackReports.length} rak</Text>
      </View>
      {rackReports.length === 0 ? (
        <EmptyState
          title="Belum ada detail rak"
          description="Report detail akan tampil setelah sesi dibuat atau scan diproses."
        />
      ) : (
        rackReports.map((rackReport, index) => {
          const rackKey =
            rackReport.rack?.id || rackReport.rack?.code || `rack-${index}`;
          const expanded = expandedRacks[rackKey] ?? false;
          return (
            <Card key={rackKey} style={styles.card}>
              <Pressable
                onPress={() =>
                  setExpandedRacks(current => ({
                    ...current,
                    [rackKey]: !expanded,
                  }))
                }
                style={styles.rackHeader}
              >
                <View style={styles.itemMain}>
                  <Text style={styles.cardTitle}>
                    {stocktakeRackLabel(rackReport.rack)}
                  </Text>
                  <Text style={styles.helper}>
                    {rackReport.scanned_count} terbaca /{' '}
                    {rackReport.expected_count} ekspektasi · selisih{' '}
                    {isDraft
                      ? rackReport.items.filter(
                          item => item.result === 'pending',
                        ).length + rackReport.changed_count
                      : rackReport.missing_count + rackReport.changed_count}
                  </Text>
                </View>
                <Text style={styles.expandText}>{expanded ? '−' : '+'}</Text>
              </Pressable>
              {expanded
                ? rackReport.items.map(item => (
                    <StocktakeItemRow
                      key={item.id ?? item.rfid_number}
                      item={item}
                    />
                  ))
                : null}
            </Card>
          );
        })
      )}

      {rejectedScans.length > 0 ? (
        <Card tone="danger" style={styles.card}>
          <Text style={styles.cardTitle}>
            Scan ditolak ({rejectedScans.length})
          </Text>
          {rejectedScans.map(scan => (
            <View
              key={`${scan.rfid_number}-${
                scan.error_code ?? scan.code ?? 'error'
              }`}
              style={styles.rejectedRow}
            >
              <Text style={styles.rfid}>{scan.rfid_number}</Text>
              <Text style={styles.itemError}>{rejectedMessage(scan)}</Text>
            </View>
          ))}
        </Card>
      ) : null}

      {isDraft ? (
        <Button
          label={
            submitState === 'loading'
              ? 'Mengirim laporan…'
              : 'Submit laporan opname'
          }
          loading={submitState === 'loading'}
          onPress={submitReport}
          disabled={
            Boolean(pending) || processingScan || submitState === 'loading'
          }
          style={styles.submitButton}
        />
      ) : (
        <Card tone="accent" style={styles.card}>
          <Text style={styles.successTitle}>Sesi sudah submitted</Text>
          <Text style={styles.successText}>
            Sesi ini tidak dapat diedit. Buat sesi baru untuk koreksi
            berikutnya.
          </Text>
        </Card>
      )}
    </Screen>
  );
}

function Stat({
  label,
  value,
  variant,
}: {
  label: string;
  value: number;
  variant: 'new' | 'old' | 'danger' | 'accent';
}) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text
        style={[
          styles.statLabel,
          {
            color:
              variant === 'new'
                ? colors.new
                : variant === 'old'
                ? colors.old
                : variant === 'danger'
                ? colors.danger
                : colors.accent,
          },
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

function StocktakeItemRow({ item }: { item: StocktakeItem }) {
  return (
    <View style={styles.detailRow}>
      <View style={styles.itemMain}>
        <View style={styles.itemHeader}>
          <Text style={styles.rfid}>{item.rfid_number}</Text>
          <Badge
            label={stocktakeResultLabel(item.result)}
            variant={resultVariant(item.result)}
          />
        </View>
        <Text style={styles.itemNote}>
          {item.product_name ?? 'Produk tidak tersedia'} · SKU:{' '}
          {item.sku ?? '-'}
        </Text>
        <Text style={styles.itemNote}>
          Pack {item.pack_number ?? '-'} · {item.units ?? '-'}{' '}
          {item.base_unit ?? 'unit'} · Exp: {item.expires_on ?? '-'}
        </Text>
        <Text style={styles.itemNote}>
          Rak report: {stocktakeItemLocation(item)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  headerMain: { flex: 1 },
  title: { ...type.title, color: colors.text },
  subtitle: { ...type.small, color: colors.muted, marginTop: spacing.xs },
  card: { marginBottom: spacing.md },
  cardTitle: { ...type.h2, color: colors.text },
  helper: {
    ...type.tiny,
    color: colors.muted,
    marginTop: spacing.xs,
    textTransform: 'none',
    letterSpacing: 0,
    lineHeight: 17,
  },
  buttonTop: { marginTop: spacing.md },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  sectionTitle: { ...type.h2, color: colors.text },
  sectionCount: {
    ...type.tiny,
    color: colors.accent,
    textTransform: 'none',
    letterSpacing: 0,
  },
  refreshButton: { padding: spacing.xs },
  refreshText: { ...type.small, color: colors.accent, fontWeight: '700' },
  input: {
    flex: 1,
    minHeight: 44,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    color: colors.text,
    paddingHorizontal: spacing.md,
    ...type.small,
  },
  notesInput: {
    minHeight: 72,
    marginTop: spacing.md,
    paddingTop: spacing.md,
    textAlignVertical: 'top',
  },
  sessionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    backgroundColor: colors.surface,
  },
  sessionNumber: { ...type.body, color: colors.text, fontWeight: '700' },
  itemMain: { flex: 1 },
  itemNote: {
    ...type.tiny,
    color: colors.muted,
    marginTop: 3,
    textTransform: 'none',
    letterSpacing: 0,
    lineHeight: 16,
  },
  backButton: { paddingVertical: spacing.xs, marginBottom: spacing.sm },
  backText: { ...type.small, color: colors.accent, fontWeight: '700' },
  requestId: {
    ...type.tiny,
    color: colors.faint,
    fontFamily: fonts.mono,
    marginTop: spacing.sm,
    textTransform: 'none',
    letterSpacing: 0,
  },
  successTitle: { ...type.h2, color: colors.new },
  successText: {
    ...type.small,
    color: colors.text,
    marginTop: spacing.xs,
    lineHeight: 19,
  },
  errorTitle: { ...type.h2, color: colors.danger },
  errorText: {
    ...type.small,
    color: colors.text,
    marginTop: spacing.xs,
    lineHeight: 19,
  },
  statGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.md,
    marginBottom: spacing.md,
  },
  stat: {
    minWidth: '28%',
    flexGrow: 1,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  statValue: { ...type.title, color: colors.text },
  statLabel: {
    ...type.tiny,
    marginTop: spacing.xs,
    textTransform: 'none',
    letterSpacing: 0,
  },
  readerStatus: {
    ...type.tiny,
    color: colors.faint,
    marginTop: spacing.sm,
    textTransform: 'none',
    letterSpacing: 0,
  },
  manualRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  bufferLabel: {
    ...type.small,
    color: colors.accent,
    marginTop: spacing.md,
    fontWeight: '700',
  },
  rfidRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  batchResultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingVertical: spacing.md,
  },
  divider: { borderTopWidth: 1, borderTopColor: colors.border },
  rfid: { ...type.small, color: colors.text, fontFamily: fonts.mono },
  removeButton: { padding: spacing.sm },
  removeText: { ...type.small, color: colors.danger, fontWeight: '700' },
  rackHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  expandText: {
    ...type.title,
    color: colors.accent,
    width: 28,
    textAlign: 'center',
  },
  detailRow: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
    marginTop: spacing.md,
  },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  itemError: {
    ...type.tiny,
    color: colors.danger,
    marginTop: 4,
    textTransform: 'none',
    letterSpacing: 0,
    lineHeight: 16,
  },
  rejectedRow: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
    marginTop: spacing.md,
  },
  submitButton: { marginTop: spacing.md, marginBottom: spacing.xl },
});
