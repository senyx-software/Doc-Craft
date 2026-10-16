import React from 'react';
import {
  Trash2, AlignLeft, AlignCenter, AlignRight, Bold, Italic, Strikethrough, Underline, Lock, Unlock, RotateCw, ChevronDown,
  AlignHorizontalJustifyStart, AlignHorizontalJustifyCenter, AlignHorizontalJustifyEnd,
  AlignVerticalJustifyStart, AlignVerticalJustifyCenter, AlignVerticalJustifyEnd,
  AlignHorizontalDistributeCenter, AlignVerticalDistributeCenter,
} from 'lucide-react';
import type { InvoiceElement, TextElement, ShapeElement } from '../../types/canvasElement';
import FontFacePicker from './FontFacePicker';

interface MultiElementInspectorProps {
  elements: InvoiceElement[];
  // Every distinct color already used somewhere in the document — shown as
  // quick-pick swatches above each color field.
  documentColors: string[];
  // Applies the same patch to every selected element in one batch.
  onUpdateAll: (patch: Partial<InvoiceElement>) => void;
  // Repositions one element at a time — align/distribute below moves each
  // element to a DIFFERENT computed x/y, which onUpdateAll's single shared
  // patch can't express.
  onUpdateOne: (id: string, patch: Partial<InvoiceElement>) => void;
  onDelete: () => void;
  onCheckpoint: () => void;
}

const LINE_STYLES: { value: string; label: string }[] = [
  { value: 'solid', label: 'Solid' },
  { value: 'dashed', label: 'Dashed' },
  { value: 'dotted', label: 'Dotted' },
  { value: 'long-dash', label: 'Long dash' },
  { value: 'dash-dot', label: 'Dash dot' },
];

const LINE_WEIGHT_PRESETS = [
  { value: 1, label: 'Thin (1px)' },
  { value: 2, label: 'Medium (2px)' },
  { value: 4, label: 'Thick (4px)' },
  { value: 8, label: 'Extra thick (8px)' },
];

// undefined = the selection has more than one distinct value for this
// property ("mixed") — every field below renders that as blank/placeholder
// rather than picking one element's value arbitrarily.
function commonValue<T>(elements: InvoiceElement[], getter: (el: InvoiceElement & Partial<Omit<TextElement, 'type'> & Omit<ShapeElement, 'type'>>) => T): T | undefined {
  if (elements.length === 0) return undefined;
  const first = getter(elements[0]);
  return elements.every((el) => getter(el) === first) ? first : undefined;
}

// Figma/Canva-style multi-select properties panel — same fields as the
// single-element ElementInspector, but every value is "mixed-aware": a
// property that differs across the selection shows blank instead of one
// arbitrarily-chosen element's value, and editing it applies the new value
// to the whole selection at once (so users can force a shared color, font
// or size across everything selected).
const MultiElementInspector: React.FC<MultiElementInspectorProps> = ({ elements, documentColors, onUpdateAll, onUpdateOne, onDelete, onCheckpoint }) => {
  const allCustom = elements.every((el) => el.id.startsWith('custom_'));
  const anyCustom = elements.some((el) => el.id.startsWith('custom_'));

  // Align edges/centers of the selection to each other (Figma/Canva-style
  // multi-select align), using the group's own bounding box as the
  // reference frame rather than the page.
  const alignSelection = (axis: 'x' | 'y', mode: 'start' | 'center' | 'end') => {
    onCheckpoint();
    if (axis === 'x') {
      const minX = Math.min(...elements.map((el) => el.x));
      const maxX = Math.max(...elements.map((el) => el.x + el.w));
      elements.forEach((el) => {
        const x = mode === 'start' ? minX : mode === 'center' ? (minX + maxX) / 2 - el.w / 2 : maxX - el.w;
        onUpdateOne(el.id, { x: Math.round(x) });
      });
    } else {
      const minY = Math.min(...elements.map((el) => el.y));
      const maxY = Math.max(...elements.map((el) => el.y + el.h));
      elements.forEach((el) => {
        const y = mode === 'start' ? minY : mode === 'center' ? (minY + maxY) / 2 - el.h / 2 : maxY - el.h;
        onUpdateOne(el.id, { y: Math.round(y) });
      });
    }
  };

  // Evenly spaces the GAPS between elements (not their positions directly)
  // along an axis — needs 3+ elements for "even spacing" to mean anything.
  const distributeSelection = (axis: 'x' | 'y') => {
    onCheckpoint();
    const sizeKey = axis === 'x' ? 'w' : 'h';
    const sorted = [...elements].sort((a, b) => a[axis] - b[axis]);
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const totalSpan = (last[axis] + last[sizeKey]) - first[axis];
    const totalSize = sorted.reduce((sum, el) => sum + el[sizeKey], 0);
    const gap = (totalSpan - totalSize) / (sorted.length - 1);
    let cursor = first[axis];
    sorted.forEach((el, i) => {
      if (i === 0 || i === sorted.length - 1) {
        cursor += el[sizeKey] + gap;
        return;
      }
      onUpdateOne(el.id, { [axis]: Math.round(cursor) } as Partial<InvoiceElement>);
      cursor += el[sizeKey] + gap;
    });
  };

  const field = (label: string, value: number | undefined, onChange: (n: number) => void) => (
    <label className="flex-1 min-w-0">
      <span className="block text-[9px] font-semibold uppercase tracking-wide text-appTextSecondary mb-1">{label}</span>
      <input
        type="number"
        value={value === undefined ? '' : Math.round(value)}
        placeholder={value === undefined ? 'Mixed' : undefined}
        onChange={(e) => { if (e.target.value !== '') onChange(Number(e.target.value)); }}
        className="w-full bg-appBg border border-appBorder rounded-[4px] px-2 py-1.5 text-xs text-appTextPrimary placeholder:text-appTextSecondary/60"
      />
    </label>
  );

  const colorField = (label: string, value: string | undefined, onChange: (v: string) => void, wrapperClassName = '') => (
    <div className={`min-w-0 ${wrapperClassName}`}>
      <span className="block text-[9px] font-semibold uppercase tracking-wide text-appTextSecondary mb-1">{label}</span>
      <div className="flex items-center gap-2">
        <input type="color" value={value || '#000000'} onChange={(e) => onChange(e.target.value)} className="w-7 h-7 rounded border border-appBorder bg-transparent cursor-pointer flex-shrink-0" />
        <input
          type="text"
          value={value || ''}
          placeholder={value === undefined ? 'Mixed' : undefined}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 min-w-0 bg-appBg border border-appBorder rounded-[4px] px-2 py-1.5 text-xs text-appTextPrimary font-mono placeholder:text-appTextSecondary/60"
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
              className={`w-4 h-4 rounded-full border ${value && c.toLowerCase() === value.toLowerCase() ? 'border-brand-500 ring-1 ring-brand-500' : 'border-appBorder'}`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      )}
    </div>
  );

  const selectField = (
    label: string,
    value: string | undefined,
    options: { value: string; label: string; style?: React.CSSProperties }[],
    onChange: (v: string) => void,
    selectStyle?: React.CSSProperties
  ) => (
    <label className="block">
      <span className="block text-[9px] font-semibold uppercase tracking-wide text-appTextSecondary mb-1">{label}</span>
      <div className="relative">
        <select
          value={value ?? '__mixed__'}
          onChange={(e) => onChange(e.target.value)}
          className="w-full appearance-none bg-appBg border border-appBorder rounded-[4px] pl-2 pr-7 py-1.5 text-xs text-appTextPrimary"
          style={selectStyle}
        >
          {value === undefined && <option value="__mixed__" disabled hidden>Mixed</option>}
          {options.map((o) => (
            <option key={o.value} value={o.value} style={o.style}>{o.label}</option>
          ))}
        </select>
        <ChevronDown size={12} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-appTextSecondary" />
      </div>
    </label>
  );

  // Toggle buttons (bold/italic/underline/strikethrough/lock): "active"
  // only when EVERY selected element already has it on; clicking flips
  // everything to the opposite of that — off if all were on, on otherwise.
  const toggleButton = (title: string, active: boolean, Icon: React.ElementType, onClick: () => void) => (
    <button
      title={title}
      onClick={onClick}
      className={`p-1.5 rounded border ${active ? 'border-brand-500 text-brand-500' : 'border-appBorder text-appTextSecondary'}`}
    >
      <Icon size={13} />
    </button>
  );

  const types = new Set(elements.map((el) => el.type));
  const allText = types.size === 1 && types.has('text');
  const allShapeLike = types.size >= 1 && [...types].every((t) => t === 'rect' || t === 'ellipse');
  const allRect = types.size === 1 && types.has('rect');
  const allLines = types.size === 1 && types.has('line');

  const rotation = commonValue(elements, (el) => el.rotation ?? 0);
  const allLocked = elements.every((el) => el.locked);
  const opacity = commonValue(elements, (el) => el.opacity ?? 1);
  const shadowEnabled = commonValue(elements, (el) => !!el.shadowEnabled);
  const shadowColor = commonValue(elements, (el) => el.shadowColor);
  const shadowBlur = commonValue(elements, (el) => el.shadowBlur);
  const shadowOffsetX = commonValue(elements, (el) => el.shadowOffsetX);
  const shadowOffsetY = commonValue(elements, (el) => el.shadowOffsetY);

  return (
    <div className="space-y-5">
      <div>
        <h5 className="text-xs font-bold text-appTextPrimary mb-2">{elements.length} elements selected</h5>
        <p className="text-[11px] text-appTextSecondary mb-3">Drag any of them to move the whole group together. Values that differ across the selection show blank — set one to apply it to all.</p>

        <label className="block mb-2">
          <span className="block text-[9px] font-semibold uppercase tracking-wide text-appTextSecondary mb-1">Opacity</span>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={0}
              max={100}
              value={opacity === undefined ? 100 : Math.round(opacity * 100)}
              onChange={(e) => onUpdateAll({ opacity: Number(e.target.value) / 100 })}
              className="flex-1 accent-brand-500"
            />
            <span className="w-10 text-right text-[10px] font-mono text-appTextSecondary">{opacity === undefined ? 'Mixed' : `${Math.round(opacity * 100)}%`}</span>
          </div>
        </label>

        <div className="flex gap-2 items-end">
          <label className="flex-1">
            <span className="block text-[9px] font-semibold uppercase tracking-wide text-appTextSecondary mb-1">Rotation</span>
            <div className="flex items-center gap-1">
              <RotateCw size={12} className="text-appTextSecondary flex-shrink-0" />
              <input
                type="number"
                value={rotation === undefined ? '' : Math.round(rotation)}
                placeholder={rotation === undefined ? 'Mixed' : undefined}
                onChange={(e) => { if (e.target.value !== '') onUpdateAll({ rotation: Number(e.target.value) }); }}
                className="w-full bg-appBg border border-appBorder rounded-[4px] px-2 py-1.5 text-xs text-appTextPrimary placeholder:text-appTextSecondary/60"
              />
            </div>
          </label>
          <button
            title={allLocked ? 'Unlock (Alt+Shift+L)' : 'Lock (Alt+Shift+L)'}
            onClick={() => onUpdateAll({ locked: !allLocked })}
            className={`p-1.5 rounded border ${allLocked ? 'border-brand-500 text-brand-500' : 'border-appBorder text-appTextSecondary'}`}
          >
            {allLocked ? <Lock size={14} /> : <Unlock size={14} />}
          </button>
        </div>

        <div className="mt-3">
          <span className="block text-[9px] font-semibold uppercase tracking-wide text-appTextSecondary mb-1">Align selection</span>
          <div className="flex items-center gap-1">
            <button title="Align left edges" onClick={() => alignSelection('x', 'start')} className="p-1.5 rounded border border-appBorder text-appTextSecondary hover:border-brand-500 hover:text-brand-500"><AlignHorizontalJustifyStart size={13} /></button>
            <button title="Align horizontal centers" onClick={() => alignSelection('x', 'center')} className="p-1.5 rounded border border-appBorder text-appTextSecondary hover:border-brand-500 hover:text-brand-500"><AlignHorizontalJustifyCenter size={13} /></button>
            <button title="Align right edges" onClick={() => alignSelection('x', 'end')} className="p-1.5 rounded border border-appBorder text-appTextSecondary hover:border-brand-500 hover:text-brand-500"><AlignHorizontalJustifyEnd size={13} /></button>
            <span className="w-px h-4 bg-appBorder mx-0.5" />
            <button title="Align top edges" onClick={() => alignSelection('y', 'start')} className="p-1.5 rounded border border-appBorder text-appTextSecondary hover:border-brand-500 hover:text-brand-500"><AlignVerticalJustifyStart size={13} /></button>
            <button title="Align vertical centers" onClick={() => alignSelection('y', 'center')} className="p-1.5 rounded border border-appBorder text-appTextSecondary hover:border-brand-500 hover:text-brand-500"><AlignVerticalJustifyCenter size={13} /></button>
            <button title="Align bottom edges" onClick={() => alignSelection('y', 'end')} className="p-1.5 rounded border border-appBorder text-appTextSecondary hover:border-brand-500 hover:text-brand-500"><AlignVerticalJustifyEnd size={13} /></button>
          </div>
          {elements.length >= 3 && (
            <div className="flex items-center gap-1 mt-1.5">
              <button title="Distribute horizontally" onClick={() => distributeSelection('x')} className="p-1.5 rounded border border-appBorder text-appTextSecondary hover:border-brand-500 hover:text-brand-500"><AlignHorizontalDistributeCenter size={13} /></button>
              <button title="Distribute vertically" onClick={() => distributeSelection('y')} className="p-1.5 rounded border border-appBorder text-appTextSecondary hover:border-brand-500 hover:text-brand-500"><AlignVerticalDistributeCenter size={13} /></button>
            </div>
          )}
        </div>
      </div>

      <div className="pt-1 border-t border-appBorder">
        <div className="flex items-center justify-between pt-3 mb-2">
          <h5 className="text-xs font-bold text-appTextPrimary">Drop shadow</h5>
          <input
            type="checkbox"
            checked={!!shadowEnabled}
            onChange={(e) => onUpdateAll({ shadowEnabled: e.target.checked } as Partial<InvoiceElement>)}
            className="w-4 h-4 accent-brand-500 cursor-pointer"
          />
        </div>
        {shadowEnabled && (
          <div className="space-y-2">
            {colorField('Color', shadowColor || '#000000', (v) => onUpdateAll({ shadowColor: v } as Partial<InvoiceElement>))}
            <div className="flex gap-2">
              {field('Blur', shadowBlur ?? 8, (n) => onUpdateAll({ shadowBlur: n } as Partial<InvoiceElement>))}
              {field('Offset X', shadowOffsetX ?? 0, (n) => onUpdateAll({ shadowOffsetX: n } as Partial<InvoiceElement>))}
              {field('Offset Y', shadowOffsetY ?? 4, (n) => onUpdateAll({ shadowOffsetY: n } as Partial<InvoiceElement>))}
            </div>
          </div>
        )}
      </div>

      {allText && (() => {
        const fontFamily = commonValue(elements, (el) => el.fontFamily || 'Inter');
        const fontSize = commonValue(elements, (el) => el.fontSize);
        const fontWeight = commonValue(elements, (el) => el.fontWeight);
        const align = commonValue(elements, (el) => el.align);
        const color = commonValue(elements, (el) => el.color);
        const stroke = commonValue(elements, (el) => el.stroke);
        const strokeWidth = commonValue(elements, (el) => el.strokeWidth);
        const allBold = elements.every(el => el.type === 'text' && el.fontWeight >= 700);
        const allItalic = elements.every(el => el.type === 'text' && el.italic);
        const allUnderline = elements.every(el => el.type === 'text' && el.underline);
        const allStrike = elements.every(el => el.type === 'text' && el.strikethrough);

        return (
          <div className="space-y-3 pt-1 border-t border-appBorder">
            <h5 className="text-xs font-bold text-appTextPrimary pt-3">Text</h5>

            <FontFacePicker
              value={fontFamily}
              onChange={(v) => onUpdateAll({ fontFamily: v } as Partial<InvoiceElement>)}
            />

            <div className="flex gap-2">
              {field('Size', fontSize, (n) => onUpdateAll({ fontSize: n } as Partial<InvoiceElement>))}
              <div className="flex-1">
                {selectField(
                  'Weight',
                  fontWeight === undefined ? undefined : String(fontWeight),
                  [400, 500, 600, 700, 800].map((w) => ({ value: String(w), label: String(w) })),
                  (v) => onUpdateAll({ fontWeight: Number(v) } as Partial<InvoiceElement>)
                )}
              </div>
            </div>

            <div className="flex items-center gap-1">
              {toggleButton('Bold (Ctrl/Cmd+B)', allBold, Bold, () => onUpdateAll({ fontWeight: allBold ? 400 : 700 } as Partial<InvoiceElement>))}
              {toggleButton('Italic (Ctrl/Cmd+I)', allItalic, Italic, () => onUpdateAll({ italic: !allItalic } as Partial<InvoiceElement>))}
              {toggleButton('Underline (Ctrl/Cmd+U)', allUnderline, Underline, () => onUpdateAll({ underline: !allUnderline } as Partial<InvoiceElement>))}
              {toggleButton('Strikethrough', allStrike, Strikethrough, () => onUpdateAll({ strikethrough: !allStrike } as Partial<InvoiceElement>))}
            </div>

            <div className="flex items-center gap-1">
              {(['left', 'center', 'right'] as const).map((a) => {
                const Icon = a === 'left' ? AlignLeft : a === 'center' ? AlignCenter : AlignRight;
                return (
                  <button
                    key={a}
                    title={`Align ${a}`}
                    onClick={() => onUpdateAll({ align: a } as Partial<InvoiceElement>)}
                    className={`p-1.5 rounded border ${align === a ? 'border-brand-500 text-brand-500' : 'border-appBorder text-appTextSecondary'}`}
                  >
                    <Icon size={13} />
                  </button>
                );
              })}
            </div>

            {colorField('Color', color, (v) => onUpdateAll({ color: v } as Partial<InvoiceElement>))}

            <div className="pt-2 border-t border-appBorder space-y-3">
              <h5 className="text-xs font-bold text-appTextPrimary pt-1">Text box border</h5>
              <div className="flex gap-2 items-end">
                {colorField('Border color', stroke, (v) => onUpdateAll({ stroke: v } as Partial<InvoiceElement>), 'flex-[2] min-w-0')}
                <label className="w-16 flex-shrink-0">
                  <span className="block text-[9px] font-semibold uppercase tracking-wide text-appTextSecondary mb-1">Width</span>
                  <input
                    type="number"
                    value={strokeWidth === undefined ? '' : Math.round(strokeWidth)}
                    placeholder={strokeWidth === undefined ? 'Mixed' : undefined}
                    onChange={(e) => { if (e.target.value !== '') onUpdateAll({ strokeWidth: Number(e.target.value) } as Partial<InvoiceElement>); }}
                    className="w-full bg-appBg border border-appBorder rounded-[4px] px-2 py-1.5 text-xs text-appTextPrimary placeholder:text-appTextSecondary/60"
                  />
                </label>
              </div>
            </div>
          </div>
        );
      })()}

      {allShapeLike && !allLines && (() => {
        const fill = commonValue(elements, (el) => el.fill);
        const stroke = commonValue(elements, (el) => el.stroke);
        const strokeWidth = commonValue(elements, (el) => el.strokeWidth);
        const radius = commonValue(elements, (el) => el.radius);

        return (
          <div className="space-y-3 pt-1 border-t border-appBorder">
            <h5 className="text-xs font-bold text-appTextPrimary pt-3">Appearance</h5>
            {colorField('Fill', fill, (v) => onUpdateAll({ fill: v } as Partial<InvoiceElement>))}
            {colorField('Stroke', stroke, (v) => onUpdateAll({ stroke: v } as Partial<InvoiceElement>))}
            {field('Stroke width', strokeWidth ?? 0, (n) => onUpdateAll({ strokeWidth: n } as Partial<InvoiceElement>))}
            {allRect && field('Corner radius', radius ?? 0, (n) => onUpdateAll({ radius: n } as Partial<InvoiceElement>))}
          </div>
        );
      })()}

      {allLines && (() => {
        const fill = commonValue(elements, (el) => el.fill);
        const lineStyle = commonValue(elements, (el) => el.lineStyle ?? 'solid');
        const strokeWidth = commonValue(elements, (el) => el.strokeWidth ?? 2);

        return (
          <div className="space-y-3 pt-1 border-t border-appBorder">
            <h5 className="text-xs font-bold text-appTextPrimary pt-3">Line</h5>
            {colorField('Color', fill, (v) => onUpdateAll({ fill: v } as Partial<InvoiceElement>))}
            {selectField('Style', lineStyle, LINE_STYLES, (v) => onUpdateAll({ lineStyle: v } as Partial<InvoiceElement>))}
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                {selectField(
                  'Weight preset',
                  strokeWidth === undefined ? undefined : (LINE_WEIGHT_PRESETS.some((p) => p.value === strokeWidth) ? String(strokeWidth) : ''),
                  [{ value: '', label: 'Custom' }, ...LINE_WEIGHT_PRESETS.map((p) => ({ value: String(p.value), label: p.label }))],
                  (v) => { if (v) onUpdateAll({ strokeWidth: Number(v) } as Partial<InvoiceElement>); }
                )}
              </div>
              {field('Weight (px)', strokeWidth, (n) => onUpdateAll({ strokeWidth: Math.max(1, n) } as Partial<InvoiceElement>))}
            </div>
          </div>
        );
      })()}

      {anyCustom && (
        <button
          onClick={onDelete}
          className="w-full flex items-center justify-center gap-1.5 text-xs font-semibold text-appError border border-appError/40 rounded-[4px] py-2 hover:bg-appError/10"
        >
          <Trash2 size={13} /> {allCustom ? 'Delete selected' : 'Delete selected (custom only)'}
        </button>
      )}
    </div>
  );
};

export default MultiElementInspector;
