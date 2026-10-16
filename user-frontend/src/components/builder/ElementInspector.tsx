import React from 'react';
import {
  Trash2, AlignLeft, AlignCenter, AlignRight, Bold, Italic, Strikethrough, Underline, Lock, Unlock, RotateCw, ChevronDown, X,
  AlignHorizontalJustifyStart, AlignHorizontalJustifyCenter, AlignHorizontalJustifyEnd,
  AlignVerticalJustifyStart, AlignVerticalJustifyCenter, AlignVerticalJustifyEnd,
} from 'lucide-react';
import type { InvoiceElement } from '../../types/canvasElement';
import { loadGoogleFont } from '../../utils/googleFonts';
import { parseCsv } from '../../utils/csv';
import FontFacePicker from './FontFacePicker';
import type { TableCellRef } from './InvoiceCanvas';

interface ElementInspectorProps {
  element: InvoiceElement;
  isCustom: boolean;
  pageWidth: number;
  pageHeight: number;
  // Every distinct color already used somewhere in the document — shown as
  // quick-pick swatches above each color field, Figma's "Selection colors"
  // panel adapted to a flat element model (no per-shape fill layers here).
  documentColors: string[];
  onUpdate: (patch: Partial<InvoiceElement>) => void;
  onDelete: () => void;
  onCheckpoint: () => void;
  // Set only when `element` is a table AND a specific cell within it is
  // selected — shows per-cell text formatting controls for that one cell.
  selectedCell?: TableCellRef | null;
}

const LINE_STYLES: { value: 'solid' | 'dashed' | 'dotted' | 'long-dash' | 'dash-dot'; label: string }[] = [
  { value: 'solid', label: 'Solid' },
  { value: 'dashed', label: 'Dashed' },
  { value: 'dotted', label: 'Dotted' },
  { value: 'long-dash', label: 'Long dash' },
  { value: 'dash-dot', label: 'Dash dot' },
];

// Word/Canva-style "Table Styles" gallery — one click sets header/cell/
// border/stripe colors together; every field stays individually editable
// below afterward, so a preset is a starting point, not a locked mode.
const TABLE_STYLE_PRESETS: { name: string; headerBg: string; headerColor: string; cellColor: string; borderColor: string; rowStripeColor?: string }[] = [
  { name: 'Plain', headerBg: '#ffffff', headerColor: '#1a1c21', cellColor: '#1a1c21', borderColor: '#e2e8f0' },
  { name: 'Minimal', headerBg: '#ffffff', headerColor: '#1a1c21', cellColor: '#1a1c21', borderColor: 'transparent' },
  { name: 'Dark header', headerBg: '#1a1c21', headerColor: '#ffffff', cellColor: '#1a1c21', borderColor: '#e2e8f0' },
  { name: 'Striped gray', headerBg: '#f1f5f9', headerColor: '#1a1c21', cellColor: '#1a1c21', borderColor: '#e2e8f0', rowStripeColor: '#f8fafc' },
  { name: 'Blue accent', headerBg: '#1d4ed8', headerColor: '#ffffff', cellColor: '#1a1c21', borderColor: '#bfdbfe', rowStripeColor: '#eff6ff' },
  { name: 'Green accent', headerBg: '#15803d', headerColor: '#ffffff', cellColor: '#1a1c21', borderColor: '#bbf7d0', rowStripeColor: '#f0fdf4' },
  { name: 'Purple accent', headerBg: '#7c3aed', headerColor: '#ffffff', cellColor: '#1a1c21', borderColor: '#ddd6fe', rowStripeColor: '#f5f3ff' },
  { name: 'Red accent', headerBg: '#b91c1c', headerColor: '#ffffff', cellColor: '#1a1c21', borderColor: '#fecaca', rowStripeColor: '#fef2f2' },
];

const LINE_WEIGHT_PRESETS = [
  { value: 1, label: 'Thin (1px)' },
  { value: 2, label: 'Medium (2px)' },
  { value: 4, label: 'Thick (4px)' },
  { value: 8, label: 'Extra thick (8px)' },
];

// Mirrors InvoiceCanvas's own line-rendering logic so the inspector's
// preview swatch matches exactly what's drawn on the canvas.
function lineStylePreview(style: string, weight: number, color: string): React.CSSProperties {
  if (style === 'long-dash') {
    return { display: 'block', height: weight, backgroundImage: `repeating-linear-gradient(to right, ${color} 0, ${color} ${weight * 6}px, transparent ${weight * 6}px, transparent ${weight * 9}px)` };
  }
  if (style === 'dash-dot') {
    return { display: 'block', height: weight, backgroundImage: `repeating-linear-gradient(to right, ${color} 0, ${color} ${weight * 4}px, transparent ${weight * 4}px, transparent ${weight * 6}px, ${color} ${weight * 6}px, ${color} ${weight * 7}px, transparent ${weight * 7}px, transparent ${weight * 9}px)` };
  }
  return { display: 'block', borderTop: `${weight}px ${style} ${color}` };
}

// Figma-style right-hand properties panel: Position (X/Y), Size (W/H), and
// Fill/Stroke or text styling depending on what's selected — shown the
// moment any canvas element is clicked.
const ElementInspector: React.FC<ElementInspectorProps> = ({ element, isCustom, pageWidth, pageHeight, documentColors, onUpdate, onDelete, onCheckpoint, selectedCell }) => {
  // "Which page" an element belongs to is implicit — y is an absolute
  // page-space coordinate, so floor(y / pageHeight) recovers the page index
  // without needing it passed in separately, and aligning "to the page"
  // uses that page's own local bounds (pageTop..pageTop+pageHeight), not
  // page 1's, so this still works correctly on page 2+ of a multi-page doc.
  const pageTop = Math.floor(element.y / pageHeight) * pageHeight;
  const alignToPage = (axis: 'x' | 'y', mode: 'start' | 'center' | 'end') => {
    onCheckpoint();
    if (axis === 'x') {
      const x = mode === 'start' ? 0 : mode === 'center' ? (pageWidth - element.w) / 2 : pageWidth - element.w;
      onUpdate({ x: Math.round(x) });
    } else {
      const y = mode === 'start' ? pageTop : mode === 'center' ? pageTop + (pageHeight - element.h) / 2 : pageTop + pageHeight - element.h;
      onUpdate({ y: Math.round(y) });
    }
  };
  const field = (label: string, value: number, onChange: (n: number) => void) => (
    <label className="flex-1 min-w-0">
      <span className="block text-[9px] font-semibold uppercase tracking-wide text-appTextSecondary mb-1">{label}</span>
      <input
        type="number"
        value={Math.round(value)}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full bg-appBg border border-appBorder rounded-[4px] px-2 py-1.5 text-xs text-appTextPrimary"
      />
    </label>
  );

  // min-w-0 (both here and on the hex <input> below) overrides flexbox's
  // default min-width:auto — without it, this field refuses to shrink
  // below its content's intrinsic width when it shares a row with another
  // field (e.g. Border color next to Border width), pushing the row wider
  // than the panel instead of both fitting side by side.
  const colorField = (label: string, value: string | undefined, onChange: (v: string) => void, wrapperClassName = '') => (
    <div className={`min-w-0 ${wrapperClassName}`}>
      <span className="block text-[9px] font-semibold uppercase tracking-wide text-appTextSecondary mb-1">{label}</span>
      <div className="flex items-center gap-2">
        <input type="color" value={value || '#000000'} onChange={(e) => onChange(e.target.value)} className="w-7 h-7 rounded border border-appBorder bg-transparent cursor-pointer flex-shrink-0" />
        <input
          type="text"
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 min-w-0 bg-appBg border border-appBorder rounded-[4px] px-2 py-1.5 text-xs text-appTextPrimary font-mono"
        />
      </div>
      {documentColors.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {documentColors.map((c) => (
            <button
              key={c}
              type="button"
              title={c}
              onClick={() => onChange(c)}
              className={`w-4 h-4 rounded-full border ${c.toLowerCase() === (value || '').toLowerCase() ? 'border-brand-500 ring-1 ring-brand-500' : 'border-appBorder'}`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      )}
    </div>
  );

  // Native <select> arrows render flush against the box edge with no
  // control over spacing — appearance-none + a manually positioned Chevron
  // gives consistent, deliberate breathing room between the arrow and the
  // edge instead of it looking "attached".
  const selectField = (
    label: string,
    value: string,
    options: { value: string; label: string; style?: React.CSSProperties }[],
    onChange: (v: string) => void,
    selectStyle?: React.CSSProperties
  ) => (
    <label className="block">
      <span className="block text-[9px] font-semibold uppercase tracking-wide text-appTextSecondary mb-1">{label}</span>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full appearance-none bg-appBg border border-appBorder rounded-[4px] pl-2 pr-7 py-1.5 text-xs text-appTextPrimary"
          style={selectStyle}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value} style={o.style}>{o.label}</option>
          ))}
        </select>
        <ChevronDown size={12} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-appTextSecondary" />
      </div>
    </label>
  );

  // Ensures a font already saved on a loaded document (not just one picked
  // from the dropdown in this session) actually gets fetched.
  const selectedFontFamily = element.type === 'text' ? element.fontFamily : undefined;
  React.useEffect(() => { if (selectedFontFamily) loadGoogleFont(selectedFontFamily); }, [selectedFontFamily]);

  // Purely a UI preference for how the W/H fields behave, not saved on the
  // element — Figma's own "constrain proportions" lock works the same way.
  const [aspectLocked, setAspectLocked] = React.useState(false);
  const aspectRatio = element.w / (element.h || 1);
  const handleWidthChange = (n: number) => {
    if (aspectLocked && element.h) onUpdate({ w: n, h: Math.round(n / aspectRatio) });
    else onUpdate({ w: n });
  };
  const handleHeightChange = (n: number) => {
    if (aspectLocked && element.w) onUpdate({ h: n, w: Math.round(n * aspectRatio) });
    else onUpdate({ h: n });
  };

  return (
    <div className="space-y-5">
      <div>
        <h5 className="text-xs font-bold text-appTextPrimary mb-2 capitalize">{element.type} · {element.section}</h5>
        <div className="flex gap-2 mb-2">
          {field('X', element.x, (n) => onUpdate({ x: n }))}
          {field('Y', element.y, (n) => onUpdate({ y: n }))}
        </div>
        <div className="flex gap-2 mb-2 items-end">
          {field('W', element.w, handleWidthChange)}
          {field('H', element.h, handleHeightChange)}
          <button
            title={aspectLocked ? 'Unlock aspect ratio' : 'Lock aspect ratio'}
            onClick={() => setAspectLocked((v) => !v)}
            className={`p-1.5 rounded border flex-shrink-0 ${aspectLocked ? 'border-brand-500 text-brand-500' : 'border-appBorder text-appTextSecondary'}`}
          >
            {aspectLocked ? <Lock size={14} /> : <Unlock size={14} />}
          </button>
        </div>
        <div className="flex gap-2 mb-2 items-end">
          <label className="flex-1">
            <span className="block text-[9px] font-semibold uppercase tracking-wide text-appTextSecondary mb-1">Opacity</span>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round((element.opacity ?? 1) * 100)}
                onChange={(e) => onUpdate({ opacity: Number(e.target.value) / 100 })}
                className="flex-1 accent-brand-500"
              />
              <span className="w-8 text-right text-[10px] font-mono text-appTextSecondary">{Math.round((element.opacity ?? 1) * 100)}%</span>
            </div>
          </label>
        </div>
        <div className="flex gap-2 items-end">
          <label className="flex-1">
            <span className="block text-[9px] font-semibold uppercase tracking-wide text-appTextSecondary mb-1">Rotation</span>
            <div className="flex items-center gap-1">
              <RotateCw size={12} className="text-appTextSecondary flex-shrink-0" />
              <input
                type="number"
                value={Math.round(element.rotation ?? 0)}
                onChange={(e) => onUpdate({ rotation: Number(e.target.value) })}
                className="w-full bg-appBg border border-appBorder rounded-[4px] px-2 py-1.5 text-xs text-appTextPrimary"
              />
            </div>
          </label>
          <button
            title={element.locked ? 'Unlock (Alt+Shift+L)' : 'Lock (Alt+Shift+L)'}
            onClick={() => onUpdate({ locked: !element.locked })}
            className={`p-1.5 rounded border ${element.locked ? 'border-brand-500 text-brand-500' : 'border-appBorder text-appTextSecondary'}`}
          >
            {element.locked ? <Lock size={14} /> : <Unlock size={14} />}
          </button>
        </div>

        <div className="mt-3">
          <span className="block text-[9px] font-semibold uppercase tracking-wide text-appTextSecondary mb-1">Align to page</span>
          <div className="flex items-center gap-1">
            <button title="Align left" onClick={() => alignToPage('x', 'start')} className="p-1.5 rounded border border-appBorder text-appTextSecondary hover:border-brand-500 hover:text-brand-500"><AlignHorizontalJustifyStart size={13} /></button>
            <button title="Align center (horizontal)" onClick={() => alignToPage('x', 'center')} className="p-1.5 rounded border border-appBorder text-appTextSecondary hover:border-brand-500 hover:text-brand-500"><AlignHorizontalJustifyCenter size={13} /></button>
            <button title="Align right" onClick={() => alignToPage('x', 'end')} className="p-1.5 rounded border border-appBorder text-appTextSecondary hover:border-brand-500 hover:text-brand-500"><AlignHorizontalJustifyEnd size={13} /></button>
            <span className="w-px h-4 bg-appBorder mx-0.5" />
            <button title="Align top" onClick={() => alignToPage('y', 'start')} className="p-1.5 rounded border border-appBorder text-appTextSecondary hover:border-brand-500 hover:text-brand-500"><AlignVerticalJustifyStart size={13} /></button>
            <button title="Align middle (vertical)" onClick={() => alignToPage('y', 'center')} className="p-1.5 rounded border border-appBorder text-appTextSecondary hover:border-brand-500 hover:text-brand-500"><AlignVerticalJustifyCenter size={13} /></button>
            <button title="Align bottom" onClick={() => alignToPage('y', 'end')} className="p-1.5 rounded border border-appBorder text-appTextSecondary hover:border-brand-500 hover:text-brand-500"><AlignVerticalJustifyEnd size={13} /></button>
          </div>
        </div>
      </div>

      <div className="pt-1 border-t border-appBorder">
        <div className="flex items-center justify-between pt-3 mb-2">
          <h5 className="text-xs font-bold text-appTextPrimary">Drop shadow</h5>
          <input
            type="checkbox"
            checked={!!element.shadowEnabled}
            onChange={(e) => onUpdate({ shadowEnabled: e.target.checked } as Partial<InvoiceElement>)}
            className="w-4 h-4 accent-brand-500 cursor-pointer"
          />
        </div>
        {element.shadowEnabled && (
          <div className="space-y-2">
            {colorField('Color', element.shadowColor || '#000000', (v) => onUpdate({ shadowColor: v } as Partial<InvoiceElement>))}
            <div className="flex gap-2">
              {field('Blur', element.shadowBlur ?? 8, (n) => onUpdate({ shadowBlur: n } as Partial<InvoiceElement>))}
              {field('Offset X', element.shadowOffsetX ?? 0, (n) => onUpdate({ shadowOffsetX: n } as Partial<InvoiceElement>))}
              {field('Offset Y', element.shadowOffsetY ?? 4, (n) => onUpdate({ shadowOffsetY: n } as Partial<InvoiceElement>))}
            </div>
          </div>
        )}
      </div>

      {element.type === 'text' && (
        <div className="space-y-3 pt-1 border-t border-appBorder">
          <h5 className="text-xs font-bold text-appTextPrimary pt-3">Text</h5>

          <FontFacePicker
            value={element.fontFamily || 'Inter'}
            onChange={(v) => onUpdate({ fontFamily: v } as Partial<InvoiceElement>)}
          />

          <div className="flex gap-2">
            {field('Size', element.fontSize, (n) => onUpdate({ fontSize: n } as Partial<InvoiceElement>))}
            <div className="flex-1">
              {selectField(
                'Weight',
                String(element.fontWeight),
                [400, 500, 600, 700, 800].map((w) => ({ value: String(w), label: String(w) })),
                (v) => onUpdate({ fontWeight: Number(v) } as Partial<InvoiceElement>)
              )}
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              title="Bold (Ctrl/Cmd+B)"
              onClick={() => onUpdate({ fontWeight: element.fontWeight >= 700 ? 400 : 700 } as Partial<InvoiceElement>)}
              className={`p-1.5 rounded border ${element.fontWeight >= 700 ? 'border-brand-500 text-brand-500' : 'border-appBorder text-appTextSecondary'}`}
            >
              <Bold size={13} />
            </button>
            <button
              title="Italic (Ctrl/Cmd+I)"
              onClick={() => onUpdate({ italic: !element.italic } as Partial<InvoiceElement>)}
              className={`p-1.5 rounded border ${element.italic ? 'border-brand-500 text-brand-500' : 'border-appBorder text-appTextSecondary'}`}
            >
              <Italic size={13} />
            </button>
            <button
              title="Underline (Ctrl/Cmd+U)"
              onClick={() => onUpdate({ underline: !element.underline } as Partial<InvoiceElement>)}
              className={`p-1.5 rounded border ${element.underline ? 'border-brand-500 text-brand-500' : 'border-appBorder text-appTextSecondary'}`}
            >
              <Underline size={13} />
            </button>
            <button
              title="Strikethrough"
              onClick={() => onUpdate({ strikethrough: !element.strikethrough } as Partial<InvoiceElement>)}
              className={`p-1.5 rounded border ${element.strikethrough ? 'border-brand-500 text-brand-500' : 'border-appBorder text-appTextSecondary'}`}
            >
              <Strikethrough size={13} />
            </button>
          </div>

          <div className="flex items-center gap-1">
            {(['left', 'center', 'right'] as const).map((a) => {
              const Icon = a === 'left' ? AlignLeft : a === 'center' ? AlignCenter : AlignRight;
              return (
                <button
                  key={a}
                  title={`Align ${a}`}
                  onClick={() => onUpdate({ align: a } as Partial<InvoiceElement>)}
                  className={`p-1.5 rounded border ${element.align === a ? 'border-brand-500 text-brand-500' : 'border-appBorder text-appTextSecondary'}`}
                >
                  <Icon size={13} />
                </button>
              );
            })}
          </div>

          {colorField('Color', element.color, (v) => onUpdate({ color: v } as Partial<InvoiceElement>))}

          <div className="pt-2 border-t border-appBorder space-y-3">
            <h5 className="text-xs font-bold text-appTextPrimary pt-1">Text box border</h5>
            <div className="flex gap-2 items-end">
              {colorField('Border color', element.stroke, (v) => onUpdate({ stroke: v } as Partial<InvoiceElement>), 'flex-[2] min-w-0')}
              <label className="w-16 flex-shrink-0">
                <span className="block text-[9px] font-semibold uppercase tracking-wide text-appTextSecondary mb-1">Width</span>
                <input
                  type="number"
                  value={Math.round(element.strokeWidth || 0)}
                  onChange={(e) => onUpdate({ strokeWidth: Number(e.target.value) } as Partial<InvoiceElement>)}
                  className="w-full bg-appBg border border-appBorder rounded-[4px] px-2 py-1.5 text-xs text-appTextPrimary"
                />
              </label>
            </div>
          </div>
        </div>
      )}

      {(element.type === 'rect' || element.type === 'ellipse') && (
        <div className="space-y-3 pt-1 border-t border-appBorder">
          <h5 className="text-xs font-bold text-appTextPrimary pt-3">Appearance</h5>
          {colorField('Fill', element.fill, (v) => onUpdate({ fill: v } as Partial<InvoiceElement>))}
          {colorField('Stroke', element.stroke, (v) => onUpdate({ stroke: v } as Partial<InvoiceElement>))}
          {field('Stroke width', element.strokeWidth || 0, (n) => onUpdate({ strokeWidth: n } as Partial<InvoiceElement>))}
          {element.type === 'rect' && field('Corner radius', element.radius || 0, (n) => onUpdate({ radius: n } as Partial<InvoiceElement>))}
        </div>
      )}

      {element.type === 'line' && (
        <div className="space-y-3 pt-1 border-t border-appBorder">
          <h5 className="text-xs font-bold text-appTextPrimary pt-3">Line</h5>
          {colorField('Color', element.fill, (v) => onUpdate({ fill: v } as Partial<InvoiceElement>))}

          <div>
            {selectField(
              'Style',
              element.lineStyle ?? 'solid',
              LINE_STYLES,
              (v) => onUpdate({ lineStyle: v } as Partial<InvoiceElement>)
            )}
            {/* Live preview — a <select>'s own options can't reliably render
                border/gradient styling across browsers, so show it here. */}
            <div className="mt-1.5 h-4 flex items-center">
              <span className="w-full" style={lineStylePreview(element.lineStyle ?? 'solid', element.strokeWidth ?? 2, element.fill)} />
            </div>
          </div>

          <div className="flex gap-2 items-end">
            <div className="flex-1">
              {selectField(
                'Weight preset',
                LINE_WEIGHT_PRESETS.some((p) => p.value === (element.strokeWidth ?? 2)) ? String(element.strokeWidth ?? 2) : '',
                [{ value: '', label: 'Custom' }, ...LINE_WEIGHT_PRESETS.map((p) => ({ value: String(p.value), label: p.label }))],
                (v) => { if (v) onUpdate({ strokeWidth: Number(v) } as Partial<InvoiceElement>); }
              )}
            </div>
            {field('Weight (px)', element.strokeWidth ?? 2, (n) => onUpdate({ strokeWidth: Math.max(1, n) } as Partial<InvoiceElement>))}
          </div>
        </div>
      )}

      {element.type === 'table' && (() => {
        const addRow = () => {
          onCheckpoint();
          const newRow = element.columns.map(() => '');
          const newRows = [...element.rows, newRow];
          onUpdate({ rows: newRows, h: element.headerHeight + newRows.length * element.rowHeight } as Partial<InvoiceElement>);
        };
        const removeRow = (idx: number) => {
          if (element.rows.length <= 1) return;
          onCheckpoint();
          const newRows = element.rows.filter((_, i) => i !== idx);
          onUpdate({ rows: newRows, h: element.headerHeight + newRows.length * element.rowHeight } as Partial<InvoiceElement>);
        };
        const addColumn = () => {
          onCheckpoint();
          onUpdate({
            columns: [...element.columns, { label: 'Column', width: 80, align: 'left' }],
            rows: element.rows.map((r) => [...r, '']),
            w: element.w + 80,
          } as Partial<InvoiceElement>);
        };
        const removeColumn = (idx: number) => {
          if (element.columns.length <= 1) return;
          onCheckpoint();
          const removedWidth = element.columns[idx].width;
          onUpdate({
            columns: element.columns.filter((_, i) => i !== idx),
            rows: element.rows.map((r) => r.filter((_, i) => i !== idx)),
            w: Math.max(60, element.w - removedWidth),
          } as Partial<InvoiceElement>);
        };
        const updateColumn = (idx: number, patch: Partial<{ label: string; width: number; align: 'left' | 'center' | 'right' }>) => {
          const widthDelta = patch.width !== undefined ? patch.width - element.columns[idx].width : 0;
          onUpdate({
            columns: element.columns.map((c, i) => (i === idx ? { ...c, ...patch } : c)),
            w: element.w + widthDelta,
          } as Partial<InvoiceElement>);
        };
        const handleCsvFile = (file: File) => {
          const reader = new FileReader();
          reader.onload = () => {
            const parsedRows = parseCsv(String(reader.result || ''));
            if (!parsedRows.length) return;
            onCheckpoint();
            const colCount = element.columns.length;
            const newRows = parsedRows.map((r) => {
              const row = r.slice(0, colCount);
              while (row.length < colCount) row.push('');
              return row;
            });
            onUpdate({ rows: newRows, h: element.headerHeight + newRows.length * element.rowHeight } as Partial<InvoiceElement>);
          };
          reader.readAsText(file);
        };

        const applyPreset = (preset: (typeof TABLE_STYLE_PRESETS)[number]) => {
          onUpdate({
            headerBg: preset.headerBg, headerColor: preset.headerColor, cellColor: preset.cellColor,
            borderColor: preset.borderColor, rowStripeColor: preset.rowStripeColor,
          } as Partial<InvoiceElement>);
        };

        const cellKey = selectedCell ? `${selectedCell.row === -1 ? 'h' : selectedCell.row}-${selectedCell.col}` : null;
        const cellFmt = cellKey ? element.cellFormats?.[cellKey] : undefined;
        const patchCellFormat = (patch: Partial<{ bold: boolean; italic: boolean; underline: boolean; align: 'left' | 'center' | 'right'; color: string; fontSize: number }>) => {
          if (!cellKey) return;
          onCheckpoint();
          onUpdate({ cellFormats: { ...element.cellFormats, [cellKey]: { ...cellFmt, ...patch } } } as Partial<InvoiceElement>);
        };
        const clearCellFormat = () => {
          if (!cellKey) return;
          onCheckpoint();
          const next = { ...element.cellFormats };
          delete next[cellKey];
          onUpdate({ cellFormats: next } as Partial<InvoiceElement>);
        };

        return (
          <div className="space-y-3 pt-1 border-t border-appBorder">
            <h5 className="text-xs font-bold text-appTextPrimary pt-3">Table</h5>

            {selectedCell && (
              <div className="space-y-2 p-2.5 bg-appBg border border-appBorder rounded-[4px]">
                <div className="flex items-center justify-between">
                  <span className="text-[9px] font-semibold uppercase tracking-wide text-appTextSecondary">
                    {selectedCell.row === -1 ? 'Header cell' : `Cell · Row ${selectedCell.row + 1}`}
                  </span>
                  {cellFmt && (
                    <button onClick={clearCellFormat} className="text-[10px] font-semibold text-appTextSecondary hover:text-appTextPrimary">Reset</button>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <button
                    title="Bold" onClick={() => patchCellFormat({ bold: !cellFmt?.bold })}
                    className={`p-1.5 rounded border ${cellFmt?.bold ? 'border-brand-500 text-brand-500' : 'border-appBorder text-appTextSecondary'}`}
                  ><Bold size={13} /></button>
                  <button
                    title="Italic" onClick={() => patchCellFormat({ italic: !cellFmt?.italic })}
                    className={`p-1.5 rounded border ${cellFmt?.italic ? 'border-brand-500 text-brand-500' : 'border-appBorder text-appTextSecondary'}`}
                  ><Italic size={13} /></button>
                  <button
                    title="Underline" onClick={() => patchCellFormat({ underline: !cellFmt?.underline })}
                    className={`p-1.5 rounded border ${cellFmt?.underline ? 'border-brand-500 text-brand-500' : 'border-appBorder text-appTextSecondary'}`}
                  ><Underline size={13} /></button>
                  <div className="w-px h-5 bg-appBorder mx-0.5" />
                  {([{ v: 'left', I: AlignLeft }, { v: 'center', I: AlignCenter }, { v: 'right', I: AlignRight }] as const).map(({ v, I }) => (
                    <button
                      key={v} title={`Align ${v}`} onClick={() => patchCellFormat({ align: v })}
                      className={`p-1.5 rounded border ${cellFmt?.align === v ? 'border-brand-500 text-brand-500' : 'border-appBorder text-appTextSecondary'}`}
                    ><I size={13} /></button>
                  ))}
                </div>
                <div className="flex gap-2 items-start">
                  <div className="w-16 flex-shrink-0">
                    {field('Size', cellFmt?.fontSize ?? element.fontSize, (n) => patchCellFormat({ fontSize: n }))}
                  </div>
                  {colorField('Text color', cellFmt?.color || (selectedCell.row === -1 ? element.headerColor : element.cellColor), (v) => patchCellFormat({ color: v }), 'flex-1')}
                </div>
              </div>
            )}

            <div>
              <span className="block text-[9px] font-semibold uppercase tracking-wide text-appTextSecondary mb-1.5">Table styles</span>
              <div className="grid grid-cols-4 gap-1.5">
                {TABLE_STYLE_PRESETS.map((preset) => (
                  <button
                    key={preset.name}
                    type="button"
                    title={preset.name}
                    onClick={() => applyPreset(preset)}
                    className="rounded-[4px] border border-appBorder overflow-hidden hover:ring-1 hover:ring-brand-500 transition-shadow"
                  >
                    <div style={{ height: 8, background: preset.headerBg, borderBottom: `1px solid ${preset.borderColor}` }} />
                    <div style={{ height: 6, background: '#ffffff' }} />
                    <div style={{ height: 6, background: preset.rowStripeColor || '#ffffff' }} />
                  </button>
                ))}
              </div>
            </div>

            {field('Font size', element.fontSize, (n) => onUpdate({ fontSize: n } as Partial<InvoiceElement>))}
            <div className="flex gap-2">
              {colorField('Header BG', element.headerBg, (v) => onUpdate({ headerBg: v } as Partial<InvoiceElement>))}
              {colorField('Header text', element.headerColor, (v) => onUpdate({ headerColor: v } as Partial<InvoiceElement>))}
            </div>
            <div className="flex gap-2">
              {colorField('Cell text', element.cellColor, (v) => onUpdate({ cellColor: v } as Partial<InvoiceElement>))}
              {colorField('Border', element.borderColor, (v) => onUpdate({ borderColor: v } as Partial<InvoiceElement>))}
            </div>
            <label className="flex items-center justify-between gap-2 cursor-pointer">
              <span className="text-xs font-semibold text-appTextPrimary">Striped rows</span>
              <input
                type="checkbox"
                checked={!!element.rowStripeColor}
                onChange={(e) => onUpdate({ rowStripeColor: e.target.checked ? (element.rowStripeColor || '#f8fafc') : undefined } as Partial<InvoiceElement>)}
                className="w-4 h-4 accent-brand-500 cursor-pointer"
              />
            </label>
            {element.rowStripeColor && colorField('Stripe color', element.rowStripeColor, (v) => onUpdate({ rowStripeColor: v } as Partial<InvoiceElement>))}

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[9px] font-semibold uppercase tracking-wide text-appTextSecondary">Columns</span>
                <button onClick={addColumn} className="text-[10px] font-semibold text-brand-500 hover:underline">+ Add column</button>
              </div>
              <div className="space-y-1.5">
                {element.columns.map((col, idx) => (
                  <div key={idx} className="flex items-center gap-1">
                    <input
                      type="text"
                      value={col.label}
                      onChange={(e) => updateColumn(idx, { label: e.target.value })}
                      className="flex-1 min-w-0 bg-appBg border border-appBorder rounded-[4px] px-2 py-1 text-xs text-appTextPrimary"
                    />
                    <input
                      type="number"
                      title="Width (px)"
                      value={col.width}
                      onChange={(e) => updateColumn(idx, { width: Number(e.target.value) })}
                      className="w-14 bg-appBg border border-appBorder rounded-[4px] px-1.5 py-1 text-xs text-appTextPrimary"
                    />
                    <button
                      onClick={() => removeColumn(idx)}
                      disabled={element.columns.length <= 1}
                      className="p-1 text-appTextSecondary hover:text-appError disabled:opacity-30 disabled:cursor-not-allowed flex-shrink-0"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[9px] font-semibold uppercase tracking-wide text-appTextSecondary">Rows ({element.rows.length})</span>
                <button onClick={addRow} className="text-[10px] font-semibold text-brand-500 hover:underline">+ Add row</button>
              </div>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {element.rows.map((row, idx) => (
                  <div key={idx} className="flex items-center gap-1.5 px-2 py-1 bg-appBg border border-appBorder rounded-[4px]">
                    <span className="flex-1 min-w-0 truncate text-xs text-appTextSecondary">{row[0] || `Row ${idx + 1}`}</span>
                    <button
                      onClick={() => removeRow(idx)}
                      disabled={element.rows.length <= 1}
                      className="text-appTextSecondary hover:text-appError disabled:opacity-30 disabled:cursor-not-allowed flex-shrink-0"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <label className="block">
              <span className="block text-[9px] font-semibold uppercase tracking-wide text-appTextSecondary mb-1">Import CSV</span>
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleCsvFile(f); e.target.value = ''; }}
                className="w-full text-xs text-appTextSecondary file:mr-2 file:py-1.5 file:px-2 file:rounded-[4px] file:border file:border-appBorder file:bg-appBg file:text-appTextPrimary file:text-xs file:cursor-pointer cursor-pointer"
              />
            </label>
          </div>
        );
      })()}

      {isCustom && (
        <button
          onClick={onDelete}
          className="w-full flex items-center justify-center gap-1.5 text-xs font-semibold text-appError border border-appError/40 rounded-[4px] py-2 hover:bg-appError/10"
        >
          <Trash2 size={13} /> Delete element
        </button>
      )}
    </div>
  );
};

export default ElementInspector;
