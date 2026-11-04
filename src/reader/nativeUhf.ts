import { NativeEventEmitter, NativeModules, Platform } from 'react-native';

export type UhfStatus = {
  status: 'idle' | 'ready' | 'reading' | 'error';
  message: string;
};

export type UhfTagEvent = {
  epc: string;
  at: number;
  source: 'uhf-g';
};

export type NativeUhfReader = {
  initialize(): Promise<UhfStatus>;
  startReading(): Promise<UhfStatus>;
  stopReading(): Promise<UhfStatus>;
  getStatus(): Promise<UhfStatus>;
  playScanFeedback?(): void;
  addListener(eventName: string): void;
  removeListeners(count: number): void;
};

export const nativeUhfReader =
  Platform.OS === 'android'
    ? (NativeModules.UhfReader as NativeUhfReader | undefined)
    : undefined;

export const uhfEventEmitter = new NativeEventEmitter(nativeUhfReader);

export const UHF_TAG_EVENT = 'UhfReaderTag';
export const UHF_STATUS_EVENT = 'UhfReaderStatus';
