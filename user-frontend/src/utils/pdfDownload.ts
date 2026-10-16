import type { ConversationSnapshot } from '../types';

/** Download is an explicit approval of the visible, committed document.
 * These requests only read storage and confirm a revision; they never run AI.
 */
export async function preparePdfDownload(options: {
  sessionId: string;
  fingerprint?: string;
  isCurrent: () => boolean;
  read: () => Promise<ConversationSnapshot>;
  confirm: (state: ConversationSnapshot) => Promise<ConversationSnapshot>;
  reconcile: (state: ConversationSnapshot) => void;
}): Promise<ConversationSnapshot> {
  const assertCurrent = () => {
    if (!options.isCurrent()) throw new Error('The document changed. Download the current document again.');
  };
  const state = await options.read();
  assertCurrent();
  if (state.sessionId !== options.sessionId) throw new Error('Could not verify the saved document. Please retry Download.');
  options.reconcile(state);
  if (!state.dataValid || state.missingRequired.length || state.pendingIntent) {
    throw new Error('Complete or clarify the document details before downloading. ' + state.nextAction.question);
  }
  if (!['ACTIVE', 'COMPLETED'].includes(state.lifecycle)) throw new Error('This document is no longer available for download.');
  if (options.fingerprint && options.fingerprint !== state.finalization?.fingerprint) {
    throw new Error('Your saved document changed. The preview has been updated; click Download again to confirm it.');
  }
  if (state.finalization?.status === 'confirmed') return state;
  if (!state.finalization?.fingerprint || state.readOnly) throw new Error('Review and confirm this document before downloading.');
  const confirmed = await options.confirm(state);
  assertCurrent();
  if (confirmed.sessionId !== state.sessionId || confirmed.revision < state.revision ||
      confirmed.finalization?.status !== 'confirmed' || confirmed.finalization.fingerprint !== state.finalization.fingerprint) {
    throw new Error('The saved document could not be confirmed. Please retry Download.');
  }
  options.reconcile(confirmed);
  return confirmed;
}
