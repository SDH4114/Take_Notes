import { db } from '@/src/core/storage';
import { resetSiteAccess } from '@/src/sites/store';

const STORES = ['projects', 'clips', 'assets', 'highlights', 'books', 'kv'] as const;

/** Wipe everything the extension stores locally (used by the options page). */
export async function clearAllData(): Promise<void> {
  const d = await db();
  const tx = d.transaction([...STORES], 'readwrite');
  await Promise.all([...STORES.map((s) => tx.objectStore(s).clear()), tx.done]);
  await resetSiteAccess();
}
