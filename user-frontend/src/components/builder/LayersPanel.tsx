import React, { useRef, useState } from 'react';
import { Type, Square, Circle, Minus, Image as ImageIcon, Table as TableIcon, Eye, EyeOff, Lock, Unlock, Trash2, GripVertical } from 'lucide-react';
import type { InvoiceElement } from '../../types/canvasElement';

interface LayersPanelProps {
  elements: InvoiceElement[];
  selectedElementIds: string[];
  onSelect: (id: string, options?: { additive?: boolean }) => void;
  onUpdate: (id: string, patch: Partial<InvoiceElement>) => void;
  onDelete: (id: string) => void;
  onCheckpoint: () => void;
  // Front-most element first — mirrors how the list is displayed, so the
  // caller just needs to turn this order back into zIndex values.
  onReorder: (frontToBackIds: string[]) => void;
}

const typeIcon = (el: InvoiceElement) => {
  switch (el.type) {
    case 'text': return <Type size={13} />;
    case 'rect': return <Square size={13} />;
    case 'ellipse': return <Circle size={13} />;
    case 'line': return <Minus size={13} />;
    case 'image': return <ImageIcon size={13} />;
    case 'table': return <TableIcon size={13} />;
  }
};

const layerLabel = (el: InvoiceElement) => {
  if (el.type === 'text') return el.text?.trim().slice(0, 28) || 'Text';
  if (el.type === 'image') return 'Image';
  if (el.type === 'rect') return 'Rectangle';
  if (el.type === 'ellipse') return 'Ellipse';
  if (el.type === 'table') return `Table (${el.rows.length} rows)`;
  return 'Line';
};

// Right-side "Layers" tab — a visual, reorderable list of every element on
// the current page, since z-order was previously only changeable blind
// (keyboard shortcuts / context menu) with no way to see what's actually
// stacked where. Sorted front-most first, matching Figma/Canva convention.
const LayersPanel: React.FC<LayersPanelProps> = ({ elements, selectedElementIds, onSelect, onUpdate, onDelete, onCheckpoint, onReorder }) => {
  const sorted = [...elements].sort((a, b) => b.zIndex - a.zIndex);
  const dragIndexRef = useRef<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const handleDrop = (dropIndex: number) => {
    const from = dragIndexRef.current;
    dragIndexRef.current = null;
    setDragOverIndex(null);
    if (from === null || from === dropIndex) return;
    const reordered = [...sorted];
    const [moved] = reordered.splice(from, 1);
    reordered.splice(dropIndex, 0, moved);
    onCheckpoint();
    onReorder(reordered.map((el) => el.id));
  };

  if (sorted.length === 0) {
    return <p className="text-xs text-appTextSecondary text-center py-8">No elements on this page yet.</p>;
  }

  return (
    <div className="space-y-0.5">
      {sorted.map((el, index) => {
        const selected = selectedElementIds.includes(el.id);
        const isCustom = el.id.startsWith('custom_');
        return (
          <div
            key={el.id}
            draggable
            onDragStart={() => { dragIndexRef.current = index; }}
            onDragOver={(e) => { e.preventDefault(); setDragOverIndex(index); }}
            onDragLeave={() => setDragOverIndex((cur) => (cur === index ? null : cur))}
            onDragEnd={() => { dragIndexRef.current = null; setDragOverIndex(null); }}
            onDrop={() => handleDrop(index)}
            onClick={(e) => onSelect(el.id, { additive: e.shiftKey || e.metaKey || e.ctrlKey })}
            className={`group flex items-center gap-2 px-2 py-1.5 rounded-[4px] cursor-pointer border ${
              selected ? 'bg-brand-500/10 border-brand-500' : 'border-transparent hover:bg-appBg'
            } ${dragOverIndex === index ? 'border-t-2 border-t-brand-500' : ''}`}
          >
            <GripVertical size={12} className="text-appTextSecondary/50 flex-shrink-0 cursor-grab" />
            <span className="text-appTextSecondary flex-shrink-0">{typeIcon(el)}</span>
            <span className={`flex-1 min-w-0 truncate text-xs ${selected ? 'text-brand-500 font-semibold' : 'text-appTextPrimary'}`}>
              {layerLabel(el)}
            </span>
            <button
              onClick={(e) => { e.stopPropagation(); onCheckpoint(); onUpdate(el.id, { hidden: !el.hidden }); }}
              title={el.hidden ? 'Show' : 'Hide'}
              className={`p-1 flex-shrink-0 ${el.hidden ? 'text-appTextSecondary/40' : 'text-appTextSecondary hover:text-appTextPrimary'}`}
            >
              {el.hidden ? <EyeOff size={13} /> : <Eye size={13} />}
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onCheckpoint(); onUpdate(el.id, { locked: !el.locked }); }}
              title={el.locked ? 'Unlock' : 'Lock'}
              className={`p-1 flex-shrink-0 ${el.locked ? 'text-brand-500' : 'text-appTextSecondary/40 hover:text-appTextPrimary'}`}
            >
              {el.locked ? <Lock size={13} /> : <Unlock size={13} />}
            </button>
            {isCustom && (
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(el.id); }}
                title="Delete"
                className="p-1 text-appTextSecondary hover:text-appError flex-shrink-0 opacity-0 group-hover:opacity-100"
              >
                <Trash2 size={13} />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default LayersPanel;
