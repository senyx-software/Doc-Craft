import React, { useState, useRef } from 'react';
import { X, AlignLeft, AlignCenter, AlignRight, Eye, EyeOff, Type, Bold, GripVertical, Upload } from 'lucide-react';
import { Reorder, motion, AnimatePresence } from 'framer-motion';
import { useDocumentStore } from '../../store/documentStore';
import type { Alignment, FontSize } from '../../types';

const FormatSidebar: React.FC = () => {
  const { isSidebarOpen, setSidebarOpen, updateLayout, accentColor, setAccentColor, layoutState } = useDocumentStore();
  const [activeSection, setActiveSection] = useState<string>('header');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const sectionsMap: Record<string, string> = {
    header: 'Header / Business Name',
    client_details: 'Client Details',
    line_items: 'Line Items',
    total: 'Total Amount',
    notes: 'Notes & Payment',
  };

  const defaultOrder = ['header', 'client_details', 'line_items', 'total', 'notes'];
  const orderedSections = layoutState?.sectionOrder || defaultOrder;

  const globalSections = [
    { id: 'logo', label: 'Logo' },
    { id: 'accent_color', label: 'Accent Colour' },
    { id: 'typography', label: 'Typography' },
  ];

  const handleAlignment = (alignment: Alignment) => {
    updateLayout(activeSection, { alignment });
  };

  const handleFontSize = (fontSize: FontSize) => {
    updateLayout(activeSection, { fontSize });
  };

  const handleBold = (bold: boolean) => {
    updateLayout(activeSection, { bold });
  };

  const handleVisibility = (visible: boolean) => {
    updateLayout(activeSection, { visible });
  };

  const handleColorChange = (color: string) => {
    setAccentColor(color);
  };

  const presetColors = [
    '#6366f1', '#3b82f6', '#06b6d4', '#10b981', '#f59e0b',
    '#ef4444', '#ec4899', '#8b5cf6', '#1e293b', '#475569',
  ];

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        updateLayout('logo', { logoUrl: reader.result as string, visible: true });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleReorder = (newOrder: string[]) => {
    updateLayout('section_order', { sectionOrder: newOrder });
  };

  const renderControls = () => {
    switch (activeSection) {
      case 'header':
        return (
          <>
            <AlignmentControl value={layoutState?.header_alignment || layoutState?.headerAlignment || 'left'} onChange={handleAlignment} />
            <FontSizeControl value={layoutState?.header_fontSize || layoutState?.fontSize || 'medium'} onChange={handleFontSize} />
            <BoldControl value={layoutState?.header_bold || layoutState?.bold || false} onChange={handleBold} />
          </>
        );
      case 'total':
        return (
          <>
            <AlignmentControl value={layoutState?.total_alignment || 'right'} onChange={handleAlignment} />
            <FontSizeControl value={layoutState?.total_fontSize || layoutState?.fontSize || 'medium'} onChange={handleFontSize} />
            <BoldControl value={layoutState?.total_bold || layoutState?.bold || false} onChange={handleBold} />
          </>
        );
      case 'client_details':
        return (
          <>
            <AlignmentControl value={layoutState?.client_details_alignment || 'left'} onChange={handleAlignment} />
            <FontSizeControl value={layoutState?.client_details_fontSize || layoutState?.fontSize || 'medium'} onChange={handleFontSize} />
            <BoldControl value={layoutState?.client_details_bold || layoutState?.bold || false} onChange={handleBold} />
            <VisibilityControl visible={true} onChange={handleVisibility} label="Show client details" />
          </>
        );
      case 'line_items':
        return (
          <VisibilityControl visible={true} onChange={(v) => updateLayout('line_items', { showQuantityColumn: v })} label="Show quantity column" />
        );
      case 'notes':
        return (
          <>
            <VisibilityControl visible={layoutState?.showNotes ?? true} onChange={handleVisibility} label="Show notes section" />
            <FontSizeControl value={layoutState?.notes_fontSize || layoutState?.fontSize || 'medium'} onChange={handleFontSize} />
          </>
        );
      case 'logo':
        return (
          <div className="space-y-4">
            <VisibilityControl visible={layoutState?.showLogo || false} onChange={(v) => updateLayout('logo', { visible: v })} label="Show logo" />

            <div className="pt-2">
              <label className="field-label block mb-2">Upload Custom Logo</label>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleLogoUpload}
                accept="image/*"
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full btn-outline text-xs flex items-center justify-center gap-2 !py-2"
              >
                <Upload size={14} />
                Select Image
              </button>
            </div>
          </div>
        );
      case 'accent_color':
        return (
          <div>
            <label className="field-label">Accent Colour</label>
            <div className="flex flex-wrap gap-2 mb-3">
              {presetColors.map((color) => (
                <button
                  key={color}
                  onClick={() => handleColorChange(color)}
                  className={`w-8 h-8 rounded-lg border-2 transition-all ${
                    accentColor === color ? 'border-white scale-110' : 'border-transparent hover:scale-105'
                  }`}
                  style={{ backgroundColor: color }}
                  title={color}
                />
              ))}
            </div>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={accentColor}
                onChange={(e) => handleColorChange(e.target.value)}
                className="w-10 h-10 rounded-lg cursor-pointer bg-transparent border border-surface-600"
                id="accent-color-picker"
              />
              <input
                type="text"
                value={accentColor}
                onChange={(e) => handleColorChange(e.target.value)}
                className="input-field text-xs !py-2 font-mono"
                placeholder="#6366f1"
                id="accent-color-input"
              />
            </div>
          </div>
        );
      case 'typography':
        return (
          <div className="space-y-4">
            <div>
              <label className="field-label block mb-2">Global Font Family</label>
              <select
                className="input-field text-sm"
                value={layoutState?.fontFamily || 'default'}
                onChange={(e) => updateLayout('global', { fontFamily: e.target.value })}
              >
                <option value="default">Default (Template match)</option>
                <option value="'Inter', sans-serif">Inter (Modern)</option>
                <option value="'Roboto', sans-serif">Roboto (Clean)</option>
                <option value="'Times New Roman', serif">Times New Roman (Classic)</option>
                <option value="'Courier New', monospace">Courier New (Monospace)</option>
                <option value="'Outfit', sans-serif">Outfit (Geometric)</option>
              </select>
            </div>
            <p className="text-[10px] text-surface-500 leading-tight">
              Overrides the template's default font family across the entire document.
            </p>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <AnimatePresence>
      {isSidebarOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/40 z-40"
            onClick={() => setSidebarOpen(false)}
          />

          {/* Sidebar */}
          <motion.div
            initial={{ x: '100%', opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: '100%', opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="sidebar-panel fixed top-0 right-0 h-full w-80 bg-surface-600 border-l border-surface-300 shadow-2xl z-50 flex flex-col"
            id="format-sidebar"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-surface-300">
              <h3 className="font-semibold text-white text-sm">Format & Layout</h3>
              <button
                onClick={() => setSidebarOpen(false)}
                className="p-1.5 hover:bg-surface-500 rounded-lg transition-colors"
                id="btn-close-sidebar"
              >
                <X size={16} className="text-surface-400" />
              </button>
            </div>

            {/* Section tabs */}
            <div className="p-3 border-b border-surface-300 max-h-[300px] overflow-y-auto">
              <div className="mb-2 px-1 flex justify-between items-center">
                <span className="text-[10px] uppercase font-bold text-surface-500 tracking-wider">Document Sections</span>
                <span className="text-[10px] text-surface-600">(Drag to reorder)</span>
              </div>
              <Reorder.Group axis="y" values={orderedSections} onReorder={handleReorder} className="space-y-1 mb-4">
                {orderedSections.map((sectionId: string) => (
                  <Reorder.Item key={sectionId} value={sectionId}>
                    <button
                      onClick={() => setActiveSection(sectionId)}
                      className={`w-full flex items-center justify-between text-left px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                        activeSection === sectionId
                          ? 'bg-brand-500/15 text-brand-300 border border-brand-500/30'
                          : 'text-surface-400 hover:text-surface-200 hover:bg-surface-500'
                      }`}
                    >
                      {sectionsMap[sectionId]}
                      <GripVertical size={12} className="text-surface-600 cursor-grab active:cursor-grabbing" />
                    </button>
                  </Reorder.Item>
                ))}
              </Reorder.Group>

              <div className="mb-2 px-1">
                <span className="text-[10px] uppercase font-bold text-surface-500 tracking-wider">Global Settings</span>
              </div>
              <div className="space-y-1">
                {globalSections.map((section) => (
                  <button
                    key={section.id}
                    onClick={() => setActiveSection(section.id)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                      activeSection === section.id
                        ? 'bg-brand-500/15 text-brand-300 border border-brand-500/30'
                        : 'text-surface-400 hover:text-surface-200 hover:bg-surface-500'
                    }`}
                  >
                    {section.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Controls */}
            <div className="p-4 space-y-5">
              {renderControls()}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

// ─── Sub-controls ──────────────────────────────

const AlignmentControl: React.FC<{ value: Alignment; onChange: (a: Alignment) => void }> = ({ value, onChange }) => (
  <div>
    <label className="field-label flex items-center gap-1.5">
      <AlignLeft size={12} /> Alignment
    </label>
    <div className="flex gap-1.5">
      {(['left', 'center', 'right'] as Alignment[]).map((a) => {
        const Icon = a === 'left' ? AlignLeft : a === 'center' ? AlignCenter : AlignRight;
        return (
          <button
            key={a}
            onClick={() => onChange(a)}
            className={`flex-1 py-2 rounded-lg flex items-center justify-center transition-colors ${
              value === a
                ? 'bg-brand-500/20 text-brand-300 border border-brand-500/40'
                : 'bg-surface-500 text-surface-400 hover:text-surface-200 border border-surface-300'
            }`}
          >
            <Icon size={14} />
          </button>
        );
      })}
    </div>
  </div>
);

const FontSizeControl: React.FC<{ value: FontSize; onChange: (s: FontSize) => void }> = ({ value, onChange }) => (
  <div>
    <label className="field-label flex items-center gap-1.5">
      <Type size={12} /> Font Size
    </label>
    <div className="flex gap-1.5">
      {(['small', 'medium', 'large'] as FontSize[]).map((s) => (
        <button
          key={s}
          onClick={() => onChange(s)}
          className={`flex-1 py-2 rounded-lg text-xs font-medium capitalize transition-colors ${
            value === s
              ? 'bg-brand-500/20 text-brand-300 border border-brand-500/40'
              : 'bg-surface-500 text-surface-400 hover:text-surface-200 border border-surface-300 hover:bg-surface-300'
          }`}
        >
          {s[0].toUpperCase()}
        </button>
      ))}
    </div>
  </div>
);

const BoldControl: React.FC<{ value: boolean; onChange: (b: boolean) => void }> = ({ value, onChange }) => (
  <div>
    <label className="field-label flex items-center gap-1.5">
      <Bold size={12} /> Bold
    </label>
    <button
      onClick={() => onChange(!value)}
      className={`px-4 py-2 rounded-lg text-xs font-semibold transition-colors ${
        value
          ? 'bg-brand-500/20 text-brand-300 border border-brand-500/40'
          : 'bg-surface-500 text-surface-400 border border-surface-300 hover:bg-surface-300'
      }`}
    >
      {value ? 'Bold On' : 'Bold Off'}
    </button>
  </div>
);

const VisibilityControl: React.FC<{ visible: boolean; onChange: (v: boolean) => void; label: string }> = ({
  visible,
  onChange,
  label,
}) => (
  <div className="flex items-center justify-between">
    <label className="field-label flex items-center gap-1.5 !mb-0">
      {visible ? <Eye size={12} /> : <EyeOff size={12} />}
      {label}
    </label>
    <button
      onClick={() => onChange(!visible)}
      className={`relative w-10 h-5 rounded-full transition-colors ${
        visible ? 'bg-brand-500' : 'bg-surface-300'
      }`}
    >
      <span
        className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-md transition-transform ${
          visible ? 'left-5' : 'left-0.5'
        }`}
      />
    </button>
  </div>
);

export default FormatSidebar;
