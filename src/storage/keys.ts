/**
 * Semua key AsyncStorage dikumpulkan di sini.
 * Prefix versi (`v1`) dipakai untuk migrasi skema di masa depan.
 */
const NS = 'optima:v1';

export const KEYS = {
  schemaVersion: `${NS}:schemaVersion`,
  settings: `${NS}:settings`,
  tagIndex: `${NS}:tagIndex`,
  logIndex: `${NS}:logIndex`,
  inventoryTransactions: `${NS}:inventoryTransactions`,
  inventoryHistory: `${NS}:inventoryHistory`,
  pendingPlacements: `${NS}:pendingPlacements`,
  placements: `${NS}:placements`,
  placementsMigrated: `${NS}:placementsMigrated`,
} as const;

export const tagKey = (epc: string) => `${NS}:tag:${epc}`;
export const logKey = (day: string) => `${NS}:log:${day}`;

export const NS_PREFIX = NS;
export const SCHEMA_VERSION = 1;
