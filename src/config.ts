import Config from 'react-native-config';

export const APP_NAME = 'OPTIMA RFID';
export const APP_VERSION = '1.0.0';
export const APP_TAGLINE = 'Placement barang hasil repacking';

declare const __DEV__: boolean;

const DEVELOPMENT_API_BASE_URL = 'http://192.168.18.16:3000';
const configuredApiBaseUrl = Config.API_BASE_URL;

/**
 * API URL di-inject saat build melalui API_BASE_URL. Fallback hanya boleh
 * dipakai oleh build development agar production tidak diam-diam menunjuk ke
 * komputer lokal.
 */
export const API_BASE_URL =
  configuredApiBaseUrl?.trim() || (__DEV__ ? DEVELOPMENT_API_BASE_URL : '');

export const READER_MODE_LABEL: Record<string, string> = {
  mock: 'SIMULASI',
  sdk: 'NATIVE SDK',
};

export const DEDUPE_DEFAULT_MS = 3000;
