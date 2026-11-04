import { useCallback, useEffect, useState } from 'react';

import {
  nativeUhfReader,
  type UhfStatus,
  UHF_STATUS_EVENT,
  UHF_TAG_EVENT,
  uhfEventEmitter,
  type UhfTagEvent,
} from './nativeUhf';

type Params = {
  enabled: boolean;
  onTag: (event: UhfTagEvent) => void;
};

const IDLE_STATUS: UhfStatus = {
  status: 'idle',
  message: 'Reader UHF belum diaktifkan',
};

export function useUhfReader({ enabled, onTag }: Params) {
  const [status, setStatus] = useState<UhfStatus>(IDLE_STATUS);

  useEffect(() => {
    const tagSubscription = uhfEventEmitter.addListener(
      UHF_TAG_EVENT,
      event => onTag(event as unknown as UhfTagEvent),
    );
    const statusSubscription = uhfEventEmitter.addListener(
      UHF_STATUS_EVENT,
      event => setStatus(event as unknown as UhfStatus),
    );
    return () => {
      tagSubscription.remove();
      statusSubscription.remove();
    };
  }, [onTag]);

  useEffect(() => {
    const reader = nativeUhfReader;
    if (!enabled || !reader) {
      return;
    }

    let cancelled = false;
    void reader.initialize().then(next => {
      if (!cancelled) setStatus(next);
    }).catch(error => {
      if (!cancelled) {
        setStatus({
          status: 'error',
          message: error instanceof Error ? error.message : 'Reader UHF gagal dibuka',
        });
      }
    });

    return () => {
      cancelled = true;
      void reader.stopReading().catch(() => undefined);
      setStatus(IDLE_STATUS);
    };
  }, [enabled]);

  const start = useCallback(async () => {
    const reader = nativeUhfReader;
    if (!reader) return IDLE_STATUS;
    try {
      const next = await reader.startReading();
      setStatus(next);
      return next;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error tidak diketahui';
      const next: UhfStatus = {
        status: 'error',
        message: message || 'Reader UHF gagal memulai scan',
      };
      setStatus(next);
      return next;
    }
  }, []);

  const stop = useCallback(async () => {
    const reader = nativeUhfReader;
    if (!reader) return IDLE_STATUS;
    try {
      const next = await reader.stopReading();
      setStatus(next);
      return next;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error tidak diketahui';
      const next: UhfStatus = {
        status: 'error',
        message: message || 'Reader UHF gagal menghentikan scan',
      };
      setStatus(next);
      return next;
    }
  }, []);

  return {
    available: Boolean(nativeUhfReader),
    status,
    reading: status.status === 'reading',
    start,
    stop,
  };
}
