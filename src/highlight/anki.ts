// Anki export. Owner: agent C. STUB — signature is a contract.
import type { Highlight } from '@/src/core/types';

/** Build a TSV importable by Anki (front<TAB>back<TAB>tags), with "#separator:tab" headers. */
export function highlightsToAnkiTsv(items: Highlight[]): string {
  return items.map((h) => `${h.text}\t${h.note ?? ''}`).join('\n');
}
