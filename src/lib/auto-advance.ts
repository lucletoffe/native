import type { AutoAdvance } from '../stores/settings-store';

/**
 * The page the viewer opens once the message at `index` left the folder
 * (archive, delete, move, spam), or null to go back to the list. "Next" and
 * "previous" are the viewer's own Next / Prev buttons; at either end of the
 * pages there is nothing to open, so the viewer goes back to the list.
 */
export function autoAdvanceTarget<T>(pages: readonly T[], index: number, mode: AutoAdvance): T | null {
  if (index < 0 || index >= pages.length || mode === 'list') return null;
  return pages[mode === 'next' ? index + 1 : index - 1] ?? null;
}
