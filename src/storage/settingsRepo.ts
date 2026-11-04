import type { Settings } from '../domain/types';
import { KEYS } from './keys';
import { enqueue, readJson, writeJson } from './json';

export const DEFAULT_SETTINGS: Settings = {
  operator: '',
  haptics: true,
  readerMode: 'sdk',
};

function isReaderMode(value: unknown): value is Settings['readerMode'] {
  return value === 'mock' || value === 'sdk';
}

/** Preferensi lama/korup tidak boleh menonaktifkan scanner. */
function normalizeSettings(stored: Partial<Settings> | null | undefined): Settings {
  return {
    operator: typeof stored?.operator === 'string' ? stored.operator : '',
    haptics:
      typeof stored?.haptics === 'boolean'
        ? stored.haptics
        : DEFAULT_SETTINGS.haptics,
    readerMode: isReaderMode(stored?.readerMode)
      ? stored.readerMode
      : DEFAULT_SETTINGS.readerMode,
  };
}

export async function loadSettings(): Promise<Settings> {
  const stored = await readJson<Partial<Settings>>(KEYS.settings, {});
  return normalizeSettings(stored);
}

export async function saveSettings(
  patch: Partial<Settings>,
): Promise<Settings> {
  // Hindari perubahan cepat saling menimpa pada read-modify-write.
  return enqueue(async () => {
    const next = normalizeSettings({ ...(await loadSettings()), ...patch });
    await writeJson(KEYS.settings, next);
    return next;
  });
}
