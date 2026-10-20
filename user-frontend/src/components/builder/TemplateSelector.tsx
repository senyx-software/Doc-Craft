import UploadPrivateTemplate from './UploadPrivateTemplate';
import UploadedTemplateThumbnail from './UploadedTemplateThumbnail';
import { useQuotaStore } from '../../store/quotaStore';
import React, { useEffect, useState } from 'react';
import { Check, Lock, Save, Trash2, FileStack, Loader2, Pencil, RefreshCw } from 'lucide-react';
import { motion } from 'framer-motion';
import { useDocumentStore, SAMPLE_DOCUMENT_DATA } from '../../store/documentStore';
import { useChatStore } from '../../store/chatStore';
import { renderTemplate } from '../../utils/templateRenderer';
import { saveCustomTemplate, getCustomTemplates, getCustomTemplateDetail, deleteCustomTemplate, renameCustomTemplate, renameUploadedTemplate, type CustomTemplateSummary } from '../../api/documents';
import type { Template, DocumentType } from '../../types';
import type { InvoiceElement } from '../../types/canvasElement';

function templateDate(value?:string) {
  if(!value)return 'Upload time unavailable';
  const date=new Date(value);
  return Number.isNaN(date.getTime())?'Upload time unavailable':date.toLocaleString();
}

function TemplateRename({id,name,uploaded,onSaved}:{id:string;name:string;uploaded:boolean;onSaved:()=>void}) {
  const [editing,setEditing]=useState(false);
  const [value,setValue]=useState(name);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const save=async()=>{
    if(!value.trim()||busy)return;
    setBusy(true);setError('');
    try {
      await (uploaded?renameUploadedTemplate:renameCustomTemplate)(id,value.trim());
      onSaved();setEditing(false);
    }catch(failure){setError(failure instanceof Error?failure.message:'Could not rename this template.');}
    finally{setBusy(false);}
  };
  if(!editing)return <button type="button" aria-label={`Rename ${name}`} className="flex items-center gap-1 text-[10px] text-brand-500" onClick={()=>{setValue(name);setError('');setEditing(true);}}><Pencil size={11}/> Rename</button>;
  return <form className="space-y-1" onSubmit={event=>{event.preventDefault();void save();}}>
    <input aria-label="Template name" className="w-full border border-appBorder bg-appBg p-1 text-xs" autoFocus maxLength={100} value={value} disabled={busy} onChange={event=>setValue(event.target.value)}/>
    <div className="flex gap-3 text-[10px]"><button className="text-brand-500" disabled={busy||!value.trim()}>{busy?'Saving…':'Save name'}</button><button type="button" disabled={busy} onClick={()=>setEditing(false)}>Cancel</button></div>
    {error&&<p role="alert" className="text-[10px] text-appError">{error}</p>}
  </form>;
}

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
    if(template.template_id.startsWith('upl_'))return '';
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
      className={`relative block w-full rounded-none overflow-hidden border-2 transition-all duration-200 group
        ${isSelected
          ? 'border-brand-500 shadow-glow'
          : 'border-appBorder hover:border-brand-500/50'
        }
        ${isLocked ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}
      `}
    >
      {/* Thumbnail */}
      <div className="aspect-[3/4] bg-appSurface flex items-center justify-center relative overflow-hidden">
        {template.template_id.startsWith("upl_") ? <UploadedTemplateThumbnail id={template.template_id} name={template.name} slots={sampleData} locked={isLocked}/> : template.thumbnail_url ? (
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
        <p className="text-[10px] text-appTextPrimary font-medium truncate" title={template.name}>{template.name}</p>
        {template.template_id.startsWith('upl_')&&<>
          <p className="text-[9px] text-appTextSecondary">{template.visibility==='public'?'Public template':'Owner only'}</p>
          <p className="text-[9px] text-appTextSecondary" title={template.created_at}>Uploaded {templateDate(template.created_at)}</p>
        </>}
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

// Approved uploads (including public layouts) and saved canvas snapshots.
const CustomTemplatesSection: React.FC<{ currentDocType: string; sampleData:Record<string,unknown> }> = ({ currentDocType,sampleData }) => {
  const { canvasElements, pageWidth, pageHeight, pageBackgroundColor, applyCustomTemplateElements, templates:availableTemplates, selectedTemplate, selectTemplate, accentColor, fetchTemplates } = useDocumentStore();
  const isPro=useQuotaStore(state=>state.entitlements?.premium_templates===true);
  const uploadedTemplates=availableTemplates.filter(template=>template.template_id.startsWith('upl_'));
  const [templates, setTemplates] = useState<CustomTemplateSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [namingOpen, setNamingOpen] = useState(false);
  const [nameValue, setNameValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  const loadTemplates = () => {
    getCustomTemplates(currentDocType)
      .then((res) => {setTemplates(res.templates);setError(null);})
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
        <h5 className="text-xs font-bold text-appTextPrimary flex items-center gap-1.5 whitespace-nowrap">
          <FileStack size={13} /> Your Templates
        </h5>
        <button type="button" aria-label="Refresh your templates" title="Refresh your templates" className="p-1 text-brand-500" onClick={()=>{loadTemplates();void fetchTemplates(currentDocType as DocumentType);}}><RefreshCw size={12}/></button>
        {!namingOpen && (
          <button
            onClick={() => setNamingOpen(true)}
            disabled={!canvasElements}
            aria-label="Save current design as template"
            title={canvasElements ? 'Save current design as a template' : 'Nothing to save yet'}
            className="flex items-center gap-1 text-[10px] font-semibold text-brand-500 hover:underline disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Save size={11} /> Save
          </button>
        )}
      </div>

      {uploadedTemplates.length>0&&<div className="space-y-4">
        {uploadedTemplates.map(template=><div key={template.template_id} className="space-y-1.5">
          <TemplateCardItem template={template} isSelected={selectedTemplate===template.template_id} isLocked={template.tier==='pro'&&!isPro} sampleData={sampleData} accentColor={accentColor} currentDocType={currentDocType} onSelect={selectTemplate}/>
          {template.can_rename&&<TemplateRename id={template.template_id} name={template.name} uploaded onSaved={()=>void fetchTemplates(currentDocType as DocumentType)}/>}
        </div>)}
      </div>}

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
      ) : templates.length === 0 && uploadedTemplates.length===0 ? (
        <p className="text-[10px] text-appTextSecondary">
          Approved uploads and public templates appear here. You can also save your current design to reuse it.
        </p>
      ) : (
        <div className="space-y-1.5">
          {templates.map((t) => (
            <div key={t.id} className="space-y-2 px-2.5 py-2 bg-appBg border border-appBorder rounded-[4px]">
              <div className="flex items-center gap-2">
              <span className="flex-1 min-w-0 truncate text-xs text-appTextPrimary font-medium" title={t.name}>{t.name}</span>
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
              <p className="text-[9px] text-appTextSecondary">Saved {templateDate(t.createdAt)}</p>
              <TemplateRename id={t.id} name={t.name} uploaded={false} onSaved={loadTemplates}/>
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

  const sampleData = SAMPLE_DOCUMENT_DATA[currentDocType] || SAMPLE_DOCUMENT_DATA.invoice;
  const activeData = React.useMemo(()=>(collectedSlots && Object.keys(collectedSlots).length > 0)
    ? { documentType: currentDocType, ...collectedSlots }
    : (collectedData || sampleData),[collectedSlots,collectedData,currentDocType,sampleData]);

  if (templates.length === 0) return null;

  return (
    <div id="template-selector">
      <UploadPrivateTemplate documentType={currentDocType}/>
      <CustomTemplatesSection key={currentDocType} currentDocType={currentDocType} sampleData={activeData}/>
      <div className="p-4 grid grid-cols-1 gap-4">
        {templates.filter(template=>!template.template_id.startsWith('upl_')).map((template: Template) => {
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
