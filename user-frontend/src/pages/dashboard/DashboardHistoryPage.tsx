import React from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useUserDocuments } from '../../hooks/useUserDocuments';
import DocumentsTable from '../../components/dashboard/DocumentsTable';

const DashboardHistoryPage: React.FC = () => {
  const { documents, error, remove } = useUserDocuments();
  const navigate = useNavigate();
  const reopen = (doc: { id: string }) => navigate(`/builder?sessionId=${encodeURIComponent(doc.id)}`);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="space-y-5 text-left"
    >
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-appTextPrimary">Document History</h1>
        <p className="text-sm text-appTextSecondary mt-1">
          View, edit, or re-download your previously created documents.
        </p>
      </div>

      <div className="p-4 bg-appSurface border border-appBorder rounded-none">
        {error && <p role="alert">{error}</p>}
        <DocumentsTable documents={documents} variant="full" onReopen={reopen} onDelete={doc => { if (window.confirm("Delete this saved session?")) void remove(doc.id); }} />
      </div>
    </motion.div>
  );
};

export default DashboardHistoryPage;
