import { useEffect, useState } from 'react';
import * as documentsApi from '../api/documents';
import { deleteUserSession } from '../api/ai';
import { useAuthStore } from '../store/authStore';
import { documentData } from '../../../shared/document-contract.mjs';
import { formatMoney } from '../../../shared/field-processing.mjs';
import type { DocumentRow } from '../components/dashboard/DocumentsTable';

export function useUserDocuments() {
  const owner = useAuthStore(state => state.user?.user_id);
  const [result, setResult] = useState<{ owner: string; documents: DocumentRow[] } | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!owner) return;
    let active = true;
    documentsApi.getUserDocuments().then(({ sessions }) => {
      if (!active) return;
      const documents = sessions.map(session => {
        const slots = documentData(session.slots || {});
        const date = new Date(session.createdAt);
        return {
          id: session.id, name: String(session.title || slots.invoiceNumber || 'Untitled document'),
          type: session.documentTypeId.toUpperCase(), client: String(slots.clientName || '—'),
          amount: typeof slots.totalDue === 'number' && slots.currency ? `${slots.currency} ${formatMoney(slots.totalDue, slots.currency)}` : '—',
          date: Number.isNaN(date.getTime()) ? '—' : date.toISOString().slice(0, 10),
          status: 'draft' as const, // A saved chat session is not proof of a PDF export.
        };
      });
      setResult({ owner, documents }); setError('');
    }).catch(failure => { if (active) setError(failure instanceof Error ? failure.message : 'History unavailable'); });
    return () => { active = false; };
  }, [owner]);
  const remove = async (id: string) => {
    try {
      await deleteUserSession(id);
      setResult(previous => previous ? { ...previous, documents: previous.documents.filter(doc => doc.id !== id) } : previous);
      setError('');
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Deletion failed'); }
  };
  return { documents: result && owner === result.owner ? result.documents : [], error, remove };
}
