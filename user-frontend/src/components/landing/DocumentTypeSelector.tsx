import React from 'react';
import { motion } from 'framer-motion';
import {
  FileText,
  FileSearch,
  Receipt,
  ShoppingCart,
  ArrowRight,
  AlertTriangle,
} from 'lucide-react';
import type { DocumentType } from '../../types';
import { DOCUMENT_TYPES } from '../../types';

interface DocumentTypeSelectorProps {
  onSelect: (type: DocumentType) => void;
  error?: string | null;
  onRetry?: () => void;
}

// Same icon set + single accent gradient as the landing page hero's
// document-type cards (heroDocIcons/heroDocStyle in LandingPage.tsx) — kept
// identical here so picking a type reads as the same component, not a
// re-skinned duplicate.
const iconMap: Record<string, React.ReactNode> = {
  FileText: <FileText size={22} />,
  FileSearch: <FileSearch size={22} />,
  Receipt: <Receipt size={22} />,
  ShoppingCart: <ShoppingCart size={22} />,
};

const cardStyle = { gradient: 'from-appPrimary to-accent-purple-500', text: 'text-appPrimary' };

const DocumentTypeSelector: React.FC<DocumentTypeSelectorProps> = ({ onSelect, error, onRetry }) => {
  return (
    <div
      className="relative min-h-[calc(100vh-5rem)] flex flex-col items-center justify-center px-4 sm:px-6 lg:px-8 py-12 overflow-hidden"
      id="document-type-selector"
    >
      {/* Background ambient glowing mesh */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] bg-gradient-to-tr from-brand-500/15 via-accent-purple-500/10 to-transparent blur-3xl rounded-full" />
        <div className="absolute bottom-10 right-10 w-96 h-96 bg-accent-blue-500/10 blur-3xl rounded-full" />
      </div>

      {/* Header section */}
      <div className="text-center max-w-2xl mx-auto mb-10 z-10">
        {/* <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-brand-500/10 border border-brand-500/20 text-brand-400 text-body-xs font-semibold mb-4 shadow-sm backdrop-blur-md"
        >
          <Sparkles size={14} className="text-brand-400 animate-pulse" />
          <span>AI-Powered Document Crafting</span>
        </motion.div> */}

        <motion.h1
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-appTextPrimary tracking-tight mb-4"
        >
          What would you like to{' '}
          <span className="bg-gradient-to-r from-brand-400 via-accent-purple-400 to-accent-pink-400 bg-clip-text text-transparent">
            create today?
          </span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="text-body-sm sm:text-body-md text-appTextSecondary max-w-lg mx-auto leading-relaxed"
        >
          Select a document type below to launch our interactive AI assistant. We'll extract details and craft a pixel-perfect design in seconds.
        </motion.p>
      </div>

      {error && (
        <div role="alert" className="relative z-10 mb-6 flex w-full max-w-5xl items-start gap-3 border border-danger/30 bg-danger/10 p-4 text-danger">
          <AlertTriangle size={20} className="mt-0.5 shrink-0" />
          <div className="flex-1 text-sm">
            <p className="font-semibold">We couldn't open your workspace.</p>
            <p className="mt-1">{error}</p>
          </div>
          {onRetry && (
            <button type="button" onClick={onRetry} className="shrink-0 px-3 py-1 text-sm font-semibold underline underline-offset-4">
              Try again
            </button>
          )}
        </div>
      )}

      {/* Cards Grid — one row of 4, same card component/styling as the
          landing page hero's document-type cards (single appPrimary/purple
          accent, rounded-none, same text sizes), just laid out full-width
          across a row instead of the hero's constrained 2x2. */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5 w-full max-w-5xl z-10">
        {DOCUMENT_TYPES.map((doc, i) => (
          <motion.button
            type="button"
            key={doc.type}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onSelect(doc.type);
            }}
            id={`doc-type-${doc.type}`}
            whileHover={{ y: -6, scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 + i * 0.06 }}
            className="p-6 rounded-none bg-appSurface/80 backdrop-blur-xl border border-appBorder/70 hover:border-appPrimary/50 shadow-lg hover:shadow-2xl hover:shadow-appPrimary/15 text-left transition-all duration-300 flex flex-col gap-3 cursor-pointer focus:outline-none focus:ring-2 focus:ring-appPrimary/30"
          >
            <div className={`w-12 h-12 rounded-none bg-gradient-to-br ${cardStyle.gradient} flex items-center justify-center text-white shadow-lg`}>
              {iconMap[doc.icon]}
            </div>
            <div>
              <h3 className={`text-sm font-extrabold uppercase tracking-wide ${cardStyle.text}`}>{doc.label}</h3>
              <p className="text-xs text-appTextSecondary mt-1 leading-relaxed">{doc.description}</p>
            </div>
            <div className="mt-auto pt-2 flex items-center gap-1 text-xs font-bold text-appTextSecondary">
              Start building
              <ArrowRight size={12} />
            </div>
          </motion.button>
        ))}
      </div>
    </div>
  );
};

export default DocumentTypeSelector;
