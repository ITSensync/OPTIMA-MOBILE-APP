import { Vibration } from 'react-native';

import { nativeUhfReader } from './nativeUhf';

/** Feedback singkat saat EPC valid diterima: satu bunyi lalu dua bunyi cepat. */
export function playScanFeedback(hapticsEnabled: boolean): void {
  if (hapticsEnabled) Vibration.vibrate([0, 45, 110, 45, 55, 45]);
  nativeUhfReader?.playScanFeedback?.();
}
