import { KEYS } from './keys';
import { enqueue, readJson, removeKey, writeJson } from './json';

export type PendingRelocationSubmission = {
  rackId: string;
  rfidNumbers: string[];
  clientRequestId: string;
  createdAt: string;
};

export async function getPendingRelocationSubmission(): Promise<PendingRelocationSubmission | null> {
  const value = await readJson<PendingRelocationSubmission | null>(
    KEYS.pendingRelocationSubmission,
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

export async function savePendingRelocationSubmission(
  submission: PendingRelocationSubmission,
): Promise<void> {
  await enqueue(() => writeJson(KEYS.pendingRelocationSubmission, submission));
}

export async function clearPendingRelocationSubmission(): Promise<void> {
  await enqueue(() => removeKey(KEYS.pendingRelocationSubmission));
}
