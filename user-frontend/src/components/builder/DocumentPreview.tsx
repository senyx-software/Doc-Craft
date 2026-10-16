import React from 'react';
import { useDocumentStore } from '../../store/documentStore';
import { Download, Sliders, Loader2, FileText, Sparkles } from 'lucide-react';
import { useChatStore } from '../../store/chatStore';
import { ApiRequestError } from '../../api/client';
import { useQuotaStore } from '../../store/quotaStore';
import { trackButtonClick } from '../../api/analytics';
import { useAuthStore } from '../../store/authStore';

const DocumentPreview: React.FC = () => {
  const {
    previewHtml,
    isGenerating,
    isExporting,
    exportPdf,
    toggleSidebar,
  } = useDocumentStore();

  const { readyToGenerate, collectedData, summary } = useChatStore();
  const { isGuest, isAuthenticated } = useAuthStore();
  const downloadBlocked = isGuest || !isAuthenticated;
  const { setShowUpgradeModal, setShowGuestDownloadModal } = useQuotaStore();

  const handleExport = async () => {
    trackButtonClick('btn_download_pdf_click');
    const { isGuest, isAuthenticated } = (await import('../../store/authStore')).useAuthStore.getState();
    if (!isAuthenticated || isGuest) {
      setShowGuestDownloadModal(true);
      return;
    }
    try {
      await exportPdf();
    } catch (err) {
      if (err instanceof ApiRequestError && err.code === 'quota_exceeded') {
        setShowUpgradeModal(true);
      }
    }
  };

  // Empty state
  if (!previewHtml && !readyToGenerate) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center px-8" id="preview-empty">
        <div className="w-20 h-20 rounded-2xl bg-surface-500 flex items-center justify-center mb-6 animate-pulse-soft">
          <FileText size={36} className="text-surface-600" />
        </div>
        <h3 className="text-lg font-semibold text-surface-300 mb-2">Document Preview</h3>
        <p className="text-sm text-surface-500 max-w-sm">
          Your document will appear here once the AI has collected the required information.
          Start by selecting a document type and chatting with the assistant.
        </p>
      </div>
    );
  }

  // Summary view (before generation)
  if (!previewHtml && readyToGenerate && summary) {
    return (
      <div className="flex flex-col h-full" id="preview-summary">
        <div className="flex items-center justify-between px-4 py-3 border-b border-surface-300/50">
          <h3 className="text-sm font-semibold text-white">Summary Review</h3>
        </div>
        <div className="flex-1 overflow-y-auto p-6">
          <div className="glass-card p-6 max-w-lg mx-auto">
            <h4 className="text-lg font-bold text-white mb-4">Ready to generate</h4>
            <pre className="text-sm text-surface-300 whitespace-pre-wrap font-sans leading-relaxed">
              {summary}
            </pre>
            {collectedData && (
              <details className="mt-4">
                <summary className="text-xs text-surface-500 cursor-pointer hover:text-surface-300 transition-colors">
                  View raw data
                </summary>
                <pre className="mt-2 text-xs text-surface-500 bg-surface-600 p-3 rounded-lg overflow-x-auto">
                  {JSON.stringify(collectedData, null, 2)}
                </pre>
              </details>
            )}

            <div className="mt-8 pt-6 border-t border-surface-300/50">
              <button
                onClick={() => {
                  const docStore = useDocumentStore.getState();
                  const chatStore = useChatStore.getState();
                  if (chatStore.sessionId && chatStore.documentType && chatStore.collectedData) {
                    docStore.generateDocument(chatStore.sessionId, chatStore.documentType, chatStore.collectedData);
                  } else {
                    console.error('Missing data to generate document:', { session: chatStore.sessionId, type: chatStore.documentType, data: chatStore.collectedData });
                  }
                }}
                disabled={isGenerating}
                className="w-full btn-primary shadow-glow justify-center py-3 text-sm"
              >
                {isGenerating ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                {isGenerating ? 'Generating Document...' : 'Generate Document'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Document preview
  return (
    <div className="flex flex-col h-full" id="document-preview">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-surface-300/50 bg-surface-600/50 backdrop-blur-sm">
        <h3 className="text-sm font-semibold text-white">Preview</h3>
        <div className="flex gap-2">
          <button
            onClick={() => { trackButtonClick('btn_format_sidebar_toggle'); toggleSidebar(); }}
            id="btn-format-sidebar"
            className="btn-ghost text-xs"
          >
            <Sliders size={14} />
            Format
          </button>
          <button
            onClick={handleExport}
            disabled={downloadBlocked || isExporting}
            title={downloadBlocked ? 'Sign in or create an account to download' : 'Download PDF and confirm the current document details'}
            id="btn-export-pdf"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white text-xs font-semibold rounded-lg hover:bg-emerald-500 transition-colors disabled:opacity-50"
          >
            {isExporting ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
            {isExporting ? 'Exporting...' : 'Download PDF'}
          </button>
        </div>
      </div>

      {downloadBlocked && <button type="button" onClick={() => setShowGuestDownloadModal(true)} className="text-xs py-2 text-brand-500">Sign in or create an account to download</button>}

      {/* Preview area */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-surface-500/50">
        {isGenerating ? (
          <div className="flex flex-col items-center justify-center h-full gap-4">
            <Loader2 size={32} className="text-brand-400 animate-spin" />
            <p className="text-sm text-surface-400">Generating your document...</p>
          </div>
        ) : (
          <div className="max-w-[800px] mx-auto">
            <iframe title="Document preview" sandbox="" className="preview-container w-full min-h-[1100px] border-0 bg-white" srcDoc={previewHtml || ''} />
          </div>
        )}
      </div>
    </div>
  );
};

export default DocumentPreview;
