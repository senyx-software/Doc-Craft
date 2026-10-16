import React from 'react';
import { FileText, Trash2 } from 'lucide-react';
import Button from '../ui/Button';

export interface DocumentRow {
  id: string;
  type: string;
  name: string;
  client: string;
  date: string;
  amount: string;
  status: 'exported' | 'draft';
}

interface DocumentsTableProps {
  documents: DocumentRow[];
  /** compact: dashboard "recent activity" (no status column, "Reopen" action).
   *  full: history tab (status column, "Download" + delete actions). */
  variant?: 'compact' | 'full';
  onReopen?: (doc: DocumentRow) => void;
  onDownload?: (doc: DocumentRow) => void;
  onDelete?: (doc: DocumentRow) => void;
}

const DocumentsTable: React.FC<DocumentsTableProps> = ({
  documents,
  variant = 'compact',
  onReopen,
  onDownload,
  onDelete,
}) => {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm text-left">
        <thead>
          <tr className="border-b border-appBorder text-appTextSecondary text-xs">
            <th className="pb-3 font-semibold">Document Name</th>
            <th className="pb-3 font-semibold">Client</th>
            <th className="pb-3 font-semibold">Date Created</th>
            <th className="pb-3 font-semibold">Total</th>
            {variant === 'full' && <th className="pb-3 font-semibold">Status</th>}
            <th className="pb-3 font-semibold text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-appBorder/55">
          {documents.map((doc) => (
            <tr key={doc.id} className="text-xs text-appTextSecondary hover:text-appTextPrimary transition-colors">
              <td className="py-3.5 font-bold flex items-center gap-2 text-appTextPrimary">
                <FileText size={14} className="text-appPrimary" />
                {doc.name}
              </td>
              <td className="py-3.5">{doc.client}</td>
              <td className="py-3.5">{doc.date}</td>
              <td className="py-3.5 font-semibold text-appTextPrimary">{doc.amount}</td>
              {variant === 'full' && (
                <td className="py-3.5">
                  <span
                    className={`px-2 py-0.5 rounded-none text-[10px] font-bold border ${
                      doc.status === 'exported'
                        ? 'bg-appSuccess/10 text-appSuccess border-appSuccess/20'
                        : 'bg-appWarning/10 text-appWarning border-appWarning/20'
                    }`}
                  >
                    {doc.status}
                  </span>
                </td>
              )}
              <td className="py-3.5 text-right space-x-2">
                {variant === 'compact' ? (
                  <Button variant="ghost" className="!py-1 !px-2.5 text-[10px]" onClick={() => onReopen?.(doc)}>
                    Reopen
                  </Button>
                ) : (
                  <>
                    <Button variant="secondary" className="!py-1 !px-2.5 text-[10px]" onClick={() => onDownload ? onDownload(doc) : onReopen?.(doc)}>
                      {onDownload ? 'Download' : 'Open'}
                    </Button>
                    <button
                      aria-label={`Delete ${doc.name}`}
                      className="p-1 hover:text-appError inline-block align-middle transition-colors"
                      onClick={() => onDelete?.(doc)}
                    >
                      <Trash2 size={14} />
                    </button>
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default DocumentsTable;
