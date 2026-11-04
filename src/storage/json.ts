import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Pembungkus tipis di atas AsyncStorage.
 * Semua error JSON.parse ditelan dan diganti fallback, supaya satu data
 * korup tidak membuat aplikasi crash total.
 */
export async function readJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (raw === null) {
      return fallback;
    }
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export async function writeJson(key: string, value: unknown): Promise<void> {
  await AsyncStorage.setItem(key, JSON.stringify(value));
}

export async function removeKey(key: string): Promise<void> {
  await AsyncStorage.removeItem(key);
}

export async function readManyJson<T>(
  keys: string[],
): Promise<Array<T | null>> {
  if (keys.length === 0) {
    return [];
  }
  const pairs = await AsyncStorage.multiGet(keys);
  return pairs.map(([, raw]) => {
    if (!raw) {
      return null;
    }
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  });
}

export async function allKeys(): Promise<string[]> {
  const keys = await AsyncStorage.getAllKeys();
  return [...keys];
}

/** Antrian global agar operasi baca-ubah-tulis tidak saling menimpa. */
let chain: Promise<unknown> = Promise.resolve();

export function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const run = chain.then(task, task);
  chain = run.catch(() => undefined);
  return run;
}
