import { KEYS } from './keys';
import { enqueue, readJson, removeKey, writeJson } from './json';

export type PendingPlacementSubmission = {
  rackId: string;
  rfidNumbers: string[];
  clientRequestId: string;
  createdAt: string;
};

export async function getPendingPlacementSubmission(): Promise<PendingPlacementSubmission | null> {
  const value = await readJson<PendingPlacementSubmission | null>(
    KEYS.pendingPlacementSubmission,
    null,
  );
  if (
    !value ||
    typeof value.rackId !== 'string' ||
    typeof value.clientRequestId !== 'string' ||
    !Array.isArray(value.rfidNumbers)
  ) {
    return null;
  }
  return value;
}

export async function savePendingPlacementSubmission(
  submission: PendingPlacementSubmission,
): Promise<void> {
  await enqueue(() => writeJson(KEYS.pendingPlacementSubmission, submission));
}

export async function clearPendingPlacementSubmission(): Promise<void> {
  await enqueue(() => removeKey(KEYS.pendingPlacementSubmission));
}
