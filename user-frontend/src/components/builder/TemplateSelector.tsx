import UploadPrivateTemplate from './UploadPrivateTemplate';
import { useQuotaStore } from '../../store/quotaStore';
import React, { useEffect, useState } from 'react';
import { Check, Lock, Save, Trash2, FileStack, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { useDocumentStore, SAMPLE_DOCUMENT_DATA } from '../../store/documentStore';
import { useChatStore } from '../../store/chatStore';
import { renderTemplate } from '../../utils/templateRenderer';
import { saveCustomTemplate, getCustomTemplates, getCustomTemplateDetail, deleteCustomTemplate, type CustomTemplateSummary } from '../../api/documents';
import type { Template } from '../../types';
import type { InvoiceElement } from '../../types/canvasElement';

interface TemplateCardItemProps {
  template: Template;
  isSelected: boolean;
  isLocked: boolean;
  sampleData: Record<string, unknown>;
  accentColor: string;
  currentDocType: string;
  onSelect: (id: string) => void;
}

const TemplateCardItem: React.FC<TemplateCardItemProps> = React.memo(({
  template,
  isSelected,
  isLocked,
  sampleData,
  accentColor,
  currentDocType,
  onSelect,
}) => {
  const renderedHtml = React.useMemo(() => {
    return renderTemplate(
      template.template_id,
      sampleData,
      {
        headerAlignment: 'left',
        fontSize: 'medium',
        showLogo: false,
        showNotes: true,
        sectionOrder: ['header', 'client_details', 'line_items', 'total', 'notes'],
      },
      accentColor,
      currentDocType
    );
  }, [template.template_id, sampleData, accentColor, currentDocType]);

  return (
    <motion.button
      type="button"
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      whileHover={{ scale: isLocked ? 1 : 1.05 }}
      whileTap={{ scale: isLocked ? 1 : 0.95 }}
      transition={{ duration: 0.2, type: 'spring', stiffness: 300 }}
      key={template.template_id}
      onClick={(e) => {
        e.preventDefault();
        if (!isLocked) onSelect(template.template_id);
      }}
      disabled={isLocked}
      id={`template-${template.template_id}`}
      className={`relative rounded-none overflow-hidden border-2 transition-all duration-200 group
        ${isSelected
          ? 'border-brand-500 shadow-glow'
          : 'border-appBorder hover:border-brand-500/50'
        }
        ${isLocked ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}
      `}
    >
      {/* Thumbnail */}
      <div className="aspect-[3/4] bg-appSurface flex items-center justify-center relative overflow-hidden">
        {template.template_id.startsWith("upl_") ? <span className="p-4 text-sm">Uploaded template · Select to preview</span> : template.thumbnail_url ? (
          <img
            src={template.thumbnail_url}
            alt={template.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <svg viewBox="0 0 595 842" className="w-full h-full pointer-events-none">
            <foreignObject width="595" height="842">
              <div
                className="w-full h-full bg-white"
                dangerouslySetInnerHTML={{ __html: renderedHtml }}
              />
            </foreignObject>
          </svg>
        )}
      </div>

      {/* Label */}
      <div className="px-1.5 py-1.5 bg-appSurface border-t border-appBorder">
        <p className="text-[10px] text-appTextPrimary font-medium truncate">{template.name}</p>
      </div>

      {/* Selected indicator */}
      {isSelected && (
        <div className="absolute top-1 right-1 w-5 h-5 bg-brand-500 rounded-full flex items-center justify-center">
          <Check size={10} className="text-white" />
        </div>
      )}

      {/* Pro lock */}
      {isLocked && (
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
          <div className="flex items-center gap-1 bg-appSurface px-2 py-1 rounded-full">
            <Lock size={10} className="text-accent-amber-400" />
            <span className="text-[9px] text-accent-amber-400 font-semibold">PRO</span>
          </div>
        </div>
      )}
    </motion.button>
  );
});

// "Your Templates" — user-saved static snapshots of the canvas (see
// applyCustomTemplateElements's own comment for why these can't be
// data-bound generators like the built-in templates). Kept as a separate
// section below the built-in grid rather than merged into TemplateCardItem,
// since rendering a faithful thumbnail from raw canvasElements would need
// a small standalone renderer of its own — out of scope here, so these
// are plain named cards instead of visual previews.
const CustomTemplatesSection: React.FC<{ currentDocType: string }> = ({ currentDocType }) => {
  const { canvasElements, pageWidth, pageHeight, pageBackgroundColor, applyCustomTemplateElements } = useDocumentStore();
  const [templates, setTemplates] = useState<CustomTemplateSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [namingOpen, setNamingOpen] = useState(false);
  const [nameValue, setNameValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  const loadTemplates = () => {
    getCustomTemplates(currentDocType)
      .then((res) => setTemplates(res.templates))
      .catch(() => setError('Could not load your saved templates.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadTemplates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentDocType]);

  const handleSave = async () => {
    if (!nameValue.trim() || !canvasElements) return;
    setSaving(true);
    setError(null);
    try {
      await saveCustomTemplate({
        name: nameValue.trim(),
        documentType: currentDocType,
        canvasElements: canvasElements as unknown[],
        pageWidth,
        pageHeight,
        pageBackgroundColor,
      });
      setNamingOpen(false);
      setNameValue('');
      loadTemplates();
    } catch {
      setError('Could not save this template — try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleApply = async (id: string) => {
    setApplyingId(id);
    setError(null);
    try {
      const detail = await getCustomTemplateDetail(id);
      applyCustomTemplateElements(
        detail.canvasElements as InvoiceElement[],
        detail.pageWidth,
        detail.pageHeight,
        detail.pageBackgroundColor
      );
    } catch {
      setError('Could not load that template — try again.');
    } finally {
      setApplyingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    setTemplates((cur) => cur.filter((t) => t.id !== id));
    try {
      await deleteCustomTemplate(id);
    } catch {
      loadTemplates();
    }
  };

  return (
    <div className="p-4 border-b border-appBorder space-y-3">
      <div className="flex items-center justify-between">
        <h5 className="text-xs font-bold text-appTextPrimary flex items-center gap-1.5">
          <FileStack size={13} /> Your Templates
        </h5>
        {!namingOpen && (
          <button
            onClick={() => setNamingOpen(true)}
            disabled={!canvasElements}
            title={canvasElements ? 'Save current design as a template' : 'Nothing to save yet'}
            className="flex items-center gap-1 text-[10px] font-semibold text-brand-500 hover:underline disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Save size={11} /> Save current
          </button>
        )}
      </div>

      {namingOpen && (
        <div className="flex items-center gap-1.5">
          <input
            type="text"
            autoFocus
            value={nameValue}
            onChange={(e) => setNameValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') setNamingOpen(false); }}
            placeholder="Template name…"
            className="flex-1 min-w-0 bg-appBg border border-appBorder rounded-[4px] px-2 py-1.5 text-xs text-appTextPrimary"
          />
          <button
            onClick={handleSave}
            disabled={saving || !nameValue.trim()}
            className="px-2.5 py-1.5 rounded-[4px] bg-brand-500 text-white text-xs font-semibold disabled:opacity-50"
          >
            {saving ? <Loader2 size={12} className="animate-spin" /> : 'Save'}
          </button>
        </div>
      )}

      {error ? (
        <p className="text-[10px] text-appError">{error}</p>
      ) : loading ? (
        <p className="text-[10px] text-appTextSecondary">Loading…</p>
      ) : templates.length === 0 ? (
        <p className="text-[10px] text-appTextSecondary">
          No saved templates yet — style a document the way you like it, then "Save current" to reuse that exact layout next time.
        </p>
      ) : (
        <div className="space-y-1.5">
          {templates.map((t) => (
            <div key={t.id} className="flex items-center gap-2 px-2.5 py-2 bg-appBg border border-appBorder rounded-[4px]">
              <span className="flex-1 min-w-0 truncate text-xs text-appTextPrimary font-medium">{t.name}</span>
              <button
                onClick={() => handleApply(t.id)}
                disabled={applyingId === t.id}
                className="text-[10px] font-semibold text-brand-500 hover:underline flex-shrink-0"
              >
                {applyingId === t.id ? <Loader2 size={11} className="animate-spin" /> : 'Apply'}
              </button>
              <button
                onClick={() => handleDelete(t.id)}
                title="Delete"
                className="p-1 text-appTextSecondary hover:text-appError flex-shrink-0"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const TemplateSelector: React.FC = () => {
  const { templates, selectedTemplate, selectTemplate, accentColor } = useDocumentStore();
  const { documentType, collectedSlots, collectedData } = useChatStore();
  const isPro = useQuotaStore(state=>state.entitlements?.premium_templates===true);

  const currentDocType = documentType || 'invoice';

  if (templates.length === 0) return null;

  const sampleData = SAMPLE_DOCUMENT_DATA[currentDocType] || SAMPLE_DOCUMENT_DATA.invoice;
  const activeData = (collectedSlots && Object.keys(collectedSlots).length > 0)
    ? { documentType: currentDocType, ...collectedSlots }
    : (collectedData || sampleData);

  return (
    <div id="template-selector">
      <UploadPrivateTemplate documentType={currentDocType}/>
      <CustomTemplatesSection key={currentDocType} currentDocType={currentDocType} />
      <div className="p-4 grid grid-cols-1 gap-4">
        {templates.map((template: Template) => {
          const isSelected = selectedTemplate === template.template_id;
          const isLocked = template.tier === 'pro' && !isPro;

          return (
            <TemplateCardItem
              key={template.template_id}
              template={template}
              isSelected={isSelected}
              isLocked={isLocked}
              sampleData={activeData}
              accentColor={accentColor}
              currentDocType={currentDocType}
              onSelect={selectTemplate}
            />
          );
        })}
      </div>
    </div>
  );
};

export default TemplateSelector;
