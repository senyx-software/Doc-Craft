import { useCommittedEvent } from '../../hooks/useCommittedEvent';
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { InvoiceElement } from '../../types/canvasElement';
import type { CanvasTool } from '../../store/documentStore';

interface SelectOptions {
  additive?: boolean;
}

// row: -1 means the header row.
export interface TableCellRef {
  elId: string;
  row: number;
  col: number;
}

interface InvoiceCanvasProps {
  elements: InvoiceElement[];
  selectedElementId: string | null;
  selectedElementIds: string[];
  activeTool: CanvasTool;
  zoom: number;
  pageWidth: number;
  pageHeight: number;
  pageBackgroundColor: string;
  showGrid: boolean;
  pageIndex?: number;
  pageOffsetY?: number;
  onSelect: (id: string | null, options?: SelectOptions) => void;
  onSelectMany: (ids: string[]) => void;
  onSelectPage: () => void;
  onUpdate: (id: string, patch: Partial<InvoiceElement>) => void;
  onUpdateMany: (ids: string[], patch: Partial<InvoiceElement> | ((id: string) => Partial<InvoiceElement>)) => void;
  onAddElement: (el: InvoiceElement) => void;
  onCheckpoint: () => void;
  // Right-click on an element — selects it first if it wasn't already part
  // of the selection (matching standard right-click behavior everywhere),
  // then reports the cursor position for BuilderPage to anchor a context
  // menu at. `cell` is set when the right-click landed inside a specific
  // table cell, so the menu can offer row/column operations.
  onContextMenu?: (e: React.MouseEvent, elementId: string, cell?: TableCellRef) => void;
  // A single click on a table cell selects just that cell (distinct from
  // selecting the whole table) — controlled from BuilderPage so the
  // inspector panel can show per-cell formatting controls for it.
  selectedCell: TableCellRef | null;
  onSelectCell: (cell: TableCellRef | null) => void;
}


// Checks a moving edge (left/center/right of `pos`+`size`) against a list of
// target coordinates (other elements' edges/centers, the page's bounds/
// center) and returns the smallest adjustment that would snap it exactly
// onto the closest target within `threshold`, plus where to draw the guide
// line — or null if nothing is close enough to snap to.
function findSnap(pos: number, size: number, targets: number[], threshold: number): { offset: number; guide: number } | null {
  const left = pos;
  const center = pos + size / 2;
  const right = pos + size;
  let best: { diff: number; offset: number; guide: number } | null = null;
  for (const t of targets) {
    const dLeft = Math.abs(left - t);
    const dCenter = Math.abs(center - t);
    const dRight = Math.abs(right - t);
    if (dLeft < threshold && (!best || dLeft < best.diff)) best = { diff: dLeft, offset: t - left, guide: t };
    if (dCenter < threshold && (!best || dCenter < best.diff)) best = { diff: dCenter, offset: t - center, guide: t };
    if (dRight < threshold && (!best || dRight < best.diff)) best = { diff: dRight, offset: t - right, guide: t };
  }
  return best ? { offset: best.offset, guide: best.guide } : null;
}

// Elements render absolutely positioned inside a fixed 595x842 page — every
// text/shape from the source template is independently selectable, movable
// (drag anywhere on the page, no opt-in needed) and resizable, matching a
// Figma-style canvas rather than a static preview.
const InvoiceCanvas: React.FC<InvoiceCanvasProps> = ({
  elements,
  selectedElementId,
  selectedElementIds,
  activeTool,
  zoom,
  pageWidth,
  pageHeight,
  pageBackgroundColor,
  showGrid,
  pageIndex = 0,
  pageOffsetY = 0,
  onSelect,
  onSelectMany,
  onSelectPage,
  onUpdate,
  onUpdateMany,
  onAddElement,
  onCheckpoint,
  onContextMenu,
  selectedCell,
  onSelectCell,
}) => {
  // Group-drag holds the starting position of every element being moved
  // together (just one, most of the time) so each keeps its own offset.
  // `checkpointed` defers the undo-history snapshot to the first actual
  // pointermove of the gesture, so a plain click-without-drag never pushes
  // a no-op undo step.
  const dragRef = useRef<{ startX: number; startY: number; origins: Record<string, { x: number; y: number }>; checkpointed: boolean } | null>(null);
  const resizeRef = useRef<{ id: string; corner: string; startX: number; startY: number; orig: { x: number; y: number; w: number; h: number }; checkpointed: boolean } | null>(null);
  const rotateRef = useRef<{ id: string; checkpointed: boolean } | null>(null);
  // Marquee/rubber-band selection — dragging from empty canvas space draws a
  // selection box; anything it intersects becomes the new selection on
  // release. Kept in a ref (not just state) so the pointerup handler always
  // sees the latest box even if a state update hasn't flushed yet.
  const marqueeRef = useRef<{ startX: number; startY: number; curX: number; curY: number; additive: boolean } | null>(null);
  const [marqueeBox, setMarqueeBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  // Canva/Figma-style alignment guides — only meaningful for a single-
  // element drag (see below), cleared whenever the gesture ends.
  const [snapLines, setSnapLines] = useState<{ x: number | null; y: number | null }>({ x: null, y: null });
  // Refs mirroring the latest elements/selection props — the window-level
  // pointerup/pointercancel safety-net listeners below are attached once
  // ([] deps) so their closure over `endInteraction` can go stale; reading
  // through refs instead keeps marquee finalization correct even there.
  const elementsRef = useRef(elements);
  useLayoutEffect(() => { elementsRef.current = elements; }, [elements]);
  const selectedElementIdsRef = useRef(selectedElementIds);
  useLayoutEffect(() => { selectedElementIdsRef.current = selectedElementIds; }, [selectedElementIds]);
  // Pointer capture is set on this stable root, never on the individual
  // text/shape node being dragged — capturing on a per-element node that
  // React can re-render/replace mid-drag (e.g. a contentEditable div
  // toggling editability the instant it becomes selected) can leave the
  // capture stuck with no further pointerup ever delivered. When that
  // happens the browser silently routes *every* click anywhere on the page
  // to the now-detached element until reload, which reads as "the whole
  // app stopped responding to clicks."
  const rootRef = useRef<HTMLDivElement>(null);
  const scale = zoom / 100;

  const endInteraction = useCommittedEvent((pointerId?: number) => {
    dragRef.current = null;
    resizeRef.current = null;
    rotateRef.current = null;
    setSnapLines({ x: null, y: null });
    if (marqueeRef.current) {
      const { startX, startY, curX, curY, additive } = marqueeRef.current;
      const bx = Math.min(startX, curX);
      const by = Math.min(startY, curY);
      const bw = Math.abs(curX - startX);
      const bh = Math.abs(curY - startY);
      marqueeRef.current = null;
      setMarqueeBox(null);
      // A near-zero box means this was really just a click on empty canvas
      // — clear the selection (unless it was a shift/ctrl/cmd click, which
      // shouldn't wipe out an existing selection over nothing).
      if (bw < 3 && bh < 3) {
        if (!additive) onSelect(null);
      } else {
        const hitIds = elementsRef.current
          .filter((el) => el.x < bx + bw && el.x + el.w > bx && el.y < by + bh && el.y + el.h > by)
          .map((el) => el.id);
        onSelectMany(additive ? Array.from(new Set([...selectedElementIdsRef.current, ...hitIds])) : hitIds);
      }
    }
    if (pointerId !== undefined && rootRef.current?.hasPointerCapture?.(pointerId)) {
      rootRef.current.releasePointerCapture(pointerId);
    }
  });

  // Safety net: if a pointerup/pointercancel never bubbles through the
  // canvas itself (capture lost, element removed, browser quirk), this
  // still fires and clears the drag/resize state so it can't get stuck.
  useEffect(() => {
    const forceEnd = (e: PointerEvent) => endInteraction(e.pointerId);
    window.addEventListener('pointerup', forceEnd);
    window.addEventListener('pointercancel', forceEnd);
    return () => {
      window.removeEventListener('pointerup', forceEnd);
      window.removeEventListener('pointercancel', forceEnd);
    };
  }, [endInteraction]);

  const handlePointerDownOnElement = useCommittedEvent((e: React.PointerEvent, el: InvoiceElement) => {
    if (activeTool !== 'select' || el.locked) return;
    e.stopPropagation();

    // Alt+drag duplicates the element in place and immediately drags the
    // copy, leaving the original untouched — matches Canva/Figma. The
    // store's addElement() self-checkpoints history, so there's no separate
    // onCheckpoint() call needed here.
    if (e.altKey) {
      const newId = `custom_${crypto.randomUUID()}`;
      onAddElement({ ...el, id: newId } as InvoiceElement);
      e.currentTarget.setPointerCapture(e.pointerId);
      dragRef.current = { startX: e.clientX, startY: e.clientY, origins: { [newId]: { x: el.x, y: el.y } }, checkpointed: true };
      return;
    }

    // Shift+click, Ctrl+click (Windows/Linux) and Cmd+click (Mac) all add
    // to / toggle the selection instead of replacing it.
    const additive = e.shiftKey || e.ctrlKey || e.metaKey;
    const alreadyInGroup = selectedElementIds.includes(el.id);
    // A persisted group (via "Group selection") always selects as a whole —
    // distinct from the transient multi-select below, which only stays
    // together for as long as it's already the active selection.
    const persistedGroupIds = el.groupId ? elements.filter((other) => other.groupId === el.groupId).map((other) => other.id) : [el.id];
    if (additive) {
      onSelect(el.id, { additive: true });
    } else if (!alreadyInGroup) {
      // Plain click on an element outside the current multi-selection
      // replaces the selection with just this one — or its whole persisted
      // group, if it belongs to one.
      if (persistedGroupIds.length > 1) onSelectMany(persistedGroupIds);
      else onSelect(el.id);
    }
    // else: plain click on an element that's already part of a multi-select
    // — keep the whole group selected so the drag below moves all of them.

    // Capture on the actual pressed element (e.currentTarget), not a
    // separate stable node — the browser only synthesizes click/dblclick
    // when pointerdown and pointerup resolve to the same element, and
    // capturing elsewhere (e.g. the canvas root) silently breaks that,
    // which is why double-click-to-edit stopped firing when this captured
    // on a shared ref instead. The window-level pointerup/pointercancel
    // listeners below are what actually guard against a stuck capture.
    e.currentTarget.setPointerCapture(e.pointerId);

    const groupIds = additive
      ? [el.id]
      : alreadyInGroup && selectedElementIds.length > 1
      ? selectedElementIds
      : persistedGroupIds;
    const origins: Record<string, { x: number; y: number }> = {};
    for (const id of groupIds) {
      const found = elements.find((candidate) => candidate.id === id);
      if (found) origins[id] = { x: found.x, y: found.y };
    }
    dragRef.current = { startX: e.clientX, startY: e.clientY, origins, checkpointed: false };
  });

  const handlePointerMove = (e: React.PointerEvent) => {
    // If we think a drag/resize is active but the primary button isn't
    // actually held anymore, the mouseup was missed somewhere — bail out
    // instead of continuing to apply position updates from a stale ref.
    if ((dragRef.current || resizeRef.current || rotateRef.current || marqueeRef.current) && !(e.buttons & 1)) {
      endInteraction(e.pointerId);
      return;
    }
    if (dragRef.current) {
      // Checkpoint once, on the first real movement of the gesture — not
      // on pointerdown — so a plain click-without-drag never pushes a
      // no-op undo step.
      if (!dragRef.current.checkpointed) {
        onCheckpoint();
        dragRef.current.checkpointed = true;
      }
      const { startX, startY, origins } = dragRef.current;
      let dx = (e.clientX - startX) / scale;
      let dy = (e.clientY - startY) / scale;
      // Shift constrains the drag to a straight horizontal or vertical line
      // (matches Canva/Figma) — lock whichever axis has moved less.
      if (e.shiftKey) {
        if (Math.abs(dx) > Math.abs(dy)) dy = 0;
        else dx = 0;
      }
      const ids = Object.keys(origins);
      if (ids.length === 1) {
        const [id] = ids;
        const el = elementsRef.current.find((candidate) => candidate.id === id);
        let newX = Math.round(origins[id].x + dx);
        let newY = Math.round(origins[id].y + dy);
        let guideX: number | null = null;
        let guideY: number | null = null;
        if (el) {
          // ~6 screen pixels of "magnetism" regardless of zoom level — the
          // threshold is expressed in page-space units, so it has to grow
          // as the page shrinks on screen to still feel like 6px.
          const threshold = 6 / scale;
          const xTargets = [0, pageWidth / 2, pageWidth];
          const yTargets = [pageOffsetY, pageOffsetY + pageHeight / 2, pageOffsetY + pageHeight];
          for (const other of elementsRef.current) {
            if (other.id === id) continue;
            xTargets.push(other.x, other.x + other.w / 2, other.x + other.w);
            yTargets.push(other.y, other.y + other.h / 2, other.y + other.h);
          }
          const snapX = findSnap(newX, el.w, xTargets, threshold);
          if (snapX) { newX += Math.round(snapX.offset); guideX = snapX.guide; }
          const snapY = findSnap(newY, el.h, yTargets, threshold);
          if (snapY) { newY += Math.round(snapY.offset); guideY = snapY.guide; }
        }
        setSnapLines({ x: guideX, y: guideY });
        onUpdate(id, { x: newX, y: newY });
      } else if (ids.length > 1) {
        if (snapLines.x !== null || snapLines.y !== null) setSnapLines({ x: null, y: null });
        onUpdateMany(ids, (id) => ({ x: Math.round(origins[id].x + dx), y: Math.round(origins[id].y + dy) }));
      }
    } else if (resizeRef.current) {
      if (!resizeRef.current.checkpointed) {
        onCheckpoint();
        resizeRef.current.checkpointed = true;
      }
      const { id, corner, startX, startY, orig } = resizeRef.current;
      const dx = (e.clientX - startX) / scale;
      const dy = (e.clientY - startY) / scale;
      const patch: Partial<InvoiceElement> = {};
      // Shift keeps the element's original aspect ratio while resizing —
      // the horizontal delta drives the size, height follows proportionally.
      if (e.shiftKey && orig.w > 0 && orig.h > 0) {
        const ratio = orig.w / orig.h;
        const rawW = orig.w + (corner.includes('w') ? -dx : dx);
        const newW = Math.max(8, rawW);
        const newH = Math.max(8, newW / ratio);
        patch.w = Math.round(newW);
        patch.h = Math.round(newH);
        if (corner.includes('w')) patch.x = Math.round(orig.x + (orig.w - newW));
        if (corner.includes('n')) patch.y = Math.round(orig.y + (orig.h - newH));
      } else {
        if (corner.includes('e')) patch.w = Math.max(8, Math.round(orig.w + dx));
        if (corner.includes('s')) patch.h = Math.max(8, Math.round(orig.h + dy));
        if (corner.includes('w')) {
          patch.w = Math.max(8, Math.round(orig.w - dx));
          patch.x = Math.round(orig.x + dx);
        }
        if (corner.includes('n')) {
          patch.h = Math.max(8, Math.round(orig.h - dy));
          patch.y = Math.round(orig.y + dy);
        }
      }
      onUpdate(id, patch);
    } else if (rotateRef.current) {
      if (!rotateRef.current.checkpointed) {
        onCheckpoint();
        rotateRef.current.checkpointed = true;
      }
      const { id } = rotateRef.current;
      const el = elementsRef.current.find((candidate) => candidate.id === id);
      if (el && rootRef.current) {
        const rootRect = rootRef.current.getBoundingClientRect();
        // Element center in screen space — the handle sits directly "up"
        // from this point in the element's own (possibly already rotated)
        // local space, so computing the absolute angle from center to
        // pointer and using it directly as the new rotation is correct
        // regardless of the current rotation value.
        // el.x/el.y are absolute page-space coordinates (consistent across
        // every page), but rootRect is THIS page's own bounding box — el.y
        // has to be brought back into this page's local space the same way
        // the render loop does (elTop = el.y - pageOffsetY) before scaling,
        // or the computed center drifts further from the real one on every
        // page after the first, making the rotate handle feel disconnected
        // from the cursor on page 2+.
        const cx = rootRect.left + (el.x + el.w / 2) * scale;
        const cy = rootRect.top + (el.y - pageOffsetY + el.h / 2) * scale;
        let deg = (Math.atan2(e.clientY - cy, e.clientX - cx) * 180) / Math.PI + 90;
        // Shift snaps to 15° increments, matching Canva/Figma/PowerPoint.
        if (e.shiftKey) deg = Math.round(deg / 15) * 15;
        onUpdate(id, { rotation: Math.round(deg) });
      }
    } else if (marqueeRef.current) {
      const rect = rootRef.current!.getBoundingClientRect();
      marqueeRef.current.curX = (e.clientX - rect.left) / scale;
      marqueeRef.current.curY = (e.clientY - rect.top) / scale;
      const { startX, startY, curX, curY } = marqueeRef.current;
      setMarqueeBox({ x: Math.min(startX, curX), y: Math.min(startY, curY), w: Math.abs(curX - startX), h: Math.abs(curY - startY) });
    }
  };

  const handleResizeStart = useCommittedEvent((e: React.PointerEvent, el: InvoiceElement, corner: string) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    resizeRef.current = { id: el.id, corner, startX: e.clientX, startY: e.clientY, orig: { x: el.x, y: el.y, w: el.w, h: el.h }, checkpointed: false };
  });

  const handleRotateStart = useCommittedEvent((e: React.PointerEvent, el: InvoiceElement) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    rotateRef.current = { id: el.id, checkpointed: false };
  });

  // Pointerdown on the canvas root itself (children stopPropagation in
  // handlePointerDownOnElement, so this only fires for genuinely empty
  // canvas) starts a marquee/rubber-band selection when the Select tool is
  // active — matches Figma/Canva drag-to-select.
  const handleRootPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (activeTool !== 'select') return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / scale;
    const y = (e.clientY - rect.top) / scale + pageOffsetY;
    marqueeRef.current = { startX: x, startY: y, curX: x, curY: y, additive: e.shiftKey || e.ctrlKey || e.metaKey };
    setMarqueeBox({ x, y, w: 0, h: 0 });
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handleCanvasClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // Marquee-select already handles selection on pointerup; a plain click
    // on the Select tool with no marquee drawn (bw/bh ~0) is handled inside
    // endInteraction instead of here, so don't double-deselect.
    if (activeTool === 'select') return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.round((e.clientX - rect.left) / scale);
    const y = Math.round((e.clientY - rect.top) / scale + pageOffsetY);
    const id = `custom_${crypto.randomUUID()}`;

    if (activeTool === 'text') {
      onAddElement({ id, type: 'text', x, y, w: 160, h: 24, text: 'Text', fontSize: 14, fontWeight: 400, color: '#1a1c21', align: 'left', section: 'custom', zIndex: 10 });
    } else if (activeTool === 'rect') {
      onAddElement({ id, type: 'rect', x, y, w: 120, h: 80, fill: '#d9dee6', section: 'custom', zIndex: 10 });
    } else if (activeTool === 'ellipse') {
      onAddElement({ id, type: 'ellipse', x, y, w: 100, h: 100, fill: '#d9dee6', section: 'custom', zIndex: 10 });
    } else if (activeTool === 'line') {
      onAddElement({ id, type: 'line', x, y, w: 150, h: 10, fill: '#1a1c21', strokeWidth: 2, lineStyle: 'solid', section: 'custom', zIndex: 10 });
    }
  };

  const handleTextEdit = (el: InvoiceElement, value: string) => {
    onUpdate(el.id, { text: value } as Partial<InvoiceElement>);
  };

  // Single click selects (and can drag); double-click enters text-edit mode.
  // Keeping these separate means clicking-and-dragging a text element never
  // fights with placing a cursor inside it, and vice versa.
  const [editingTarget, setEditingId] = useState<string | null>(null);
  if (editingTarget !== null && editingTarget !== selectedElementId) setEditingId(null);
  const editingId = editingTarget === selectedElementId ? editingTarget : null;

  // Selecting a different element (or deselecting) always exits edit mode —
  // otherwise a stray contentEditable could stay active on an element that
  // isn't even selected anymore.
  const handleTextDoubleClick = (e: React.MouseEvent, el: InvoiceElement) => {
    if (activeTool !== 'select') return;
    e.stopPropagation();
    onSelect(el.id);
    setEditingId(el.id);
    const target = e.currentTarget as HTMLElement;
    // Focus synchronously — contentEditable only takes effect on the next
    // React render, so flip it on the DOM directly first or the browser
    // won't treat the element as focusable/editable yet.
    target.contentEditable = 'true';
    target.focus();
    const range = document.createRange();
    range.selectNodeContents(target);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  };

  // Table cell editing — separate from editingId (which is scoped to a
  // whole TextElement's body) since a table needs to track WHICH cell.
  // row: -1 means the header row.
  const [editingCellTarget, setEditingCell] = useState<{ elId: string; row: number; col: number } | null>(null);
  if (editingCellTarget && editingCellTarget.elId !== selectedElementId) setEditingCell(null);
  const editingCell = editingCellTarget?.elId === selectedElementId ? editingCellTarget : null;
  const handleCellDoubleClick = (e: React.MouseEvent, elId: string, row: number, col: number) => {
    if (activeTool !== 'select') return;
    e.stopPropagation();
    onSelect(elId);
    setEditingCell({ elId, row, col });
    const target = e.currentTarget as HTMLElement;
    target.contentEditable = 'true';
    target.focus();
    const range = document.createRange();
    range.selectNodeContents(target);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  };

  const sorted = [...elements].sort((a, b) => a.zIndex - b.zIndex);

  return (
    <div
      ref={rootRef}
      className="relative select-none"
      style={{ width: pageWidth, height: pageHeight, backgroundColor: pageBackgroundColor, cursor: activeTool === 'select' ? 'default' : 'crosshair' }}
      onPointerDown={handleRootPointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={(e) => endInteraction(e.pointerId)}
      onPointerCancel={(e) => endInteraction(e.pointerId)}
      onLostPointerCapture={(e) => endInteraction(e.pointerId)}
      onClick={handleCanvasClick}
      onDoubleClick={(e) => { if (activeTool === 'select' && e.target === e.currentTarget) onSelectPage(); }}
      id={`invoice-canvas-page-${pageIndex}`}
      data-page-index={pageIndex}
    >
      {/* Toggleable background grid — purely visual, no snapping tied to
          it (snapping instead targets other elements' edges/centers and
          the page's own bounds/center, which is the more useful reference
          when actually laying things out). */}
      {showGrid && (
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage: 'linear-gradient(to right, rgba(0,0,0,0.06) 1px, transparent 1px), linear-gradient(to bottom, rgba(0,0,0,0.06) 1px, transparent 1px)',
            backgroundSize: '20px 20px',
          }}
        />
      )}
      {snapLines.x !== null && (
        <div className="pointer-events-none absolute top-0 bottom-0 w-px bg-pink-500" style={{ left: snapLines.x }} />
      )}
      {snapLines.y !== null && snapLines.y >= pageOffsetY && snapLines.y <= pageOffsetY + pageHeight && (
        <div className="pointer-events-none absolute left-0 right-0 h-px bg-pink-500" style={{ top: snapLines.y - pageOffsetY }} />
      )}
      {sorted.map((el) => {
        if (el.hidden) return null;
        const elTop = el.y - pageOffsetY;
        const elHeight = el.h || 20;
        if (elTop + elHeight < -10 || elTop > pageHeight + 10) return null;

        const isSelected = selectedElementIds.includes(el.id);
        const isPrimarySelection = el.id === selectedElementId;
        // Drop shadow — box-shadow for filled shapes/images (needs an opaque
        // shape to read correctly), text-shadow for text (a box-shadow on a
        // transparent-background text wrapper would just outline empty
        // space instead of hugging the glyphs).
        const shadowValue = el.shadowEnabled
          ? `${el.shadowOffsetX ?? 0}px ${el.shadowOffsetY ?? 4}px ${el.shadowBlur ?? 8}px ${el.shadowColor ?? 'rgba(0,0,0,0.35)'}`
          : undefined;
        const commonStyle: React.CSSProperties = {
          position: 'absolute',
          left: el.x,
          top: elTop,
          width: el.w,
          minHeight: el.h,
          height: el.type === 'text' ? 'auto' : el.h,
          opacity: el.opacity ?? 1,
          boxShadow: el.type !== 'text' ? shadowValue : undefined,
          // Rotate first, then flip — order matters for the combined
          // transform to look right when both are set, and matches how
          // Figma/Canva apply the two together.
          transform: [
            el.rotation ? `rotate(${el.rotation}deg)` : '',
            el.flipH ? 'scaleX(-1)' : '',
            el.flipV ? 'scaleY(-1)' : '',
          ].filter(Boolean).join(' ') || undefined,
        };

        let body: React.ReactNode;
        if (el.type === 'text') {
          const isEditing = el.id === editingId;
          body = (
            <div
              contentEditable={isEditing}
              suppressContentEditableWarning
              onDoubleClick={(e) => handleTextDoubleClick(e, el)}
              onBlur={(e) => {
                if (isEditing) {
                  handleTextEdit(el, e.currentTarget.textContent || '');
                  setEditingId(null);
                }
              }}
              onPointerDown={(e) => { if (!isEditing) handlePointerDownOnElement(e, el); else e.stopPropagation(); }}
              style={{
                width: '100%',
                minHeight: '100%',
                fontSize: el.fontSize,
                fontWeight: el.fontWeight,
                fontStyle: el.italic ? 'italic' : 'normal',
                textDecoration: [el.underline && 'underline', el.strikethrough && 'line-through'].filter(Boolean).join(' ') || 'none',
                color: el.color,
                textAlign: el.align,
                fontFamily: el.fontFamily || "'Inter', sans-serif",
                lineHeight: el.lineHeight ?? 1.35,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                boxSizing: 'border-box',
                textShadow: shadowValue,
                border: el.stroke ? `${el.strokeWidth ?? 1}px solid ${el.stroke}` : undefined,
                outline: isEditing ? '1px dashed currentColor' : 'none',
                cursor: isEditing ? 'text' : activeTool === 'select' ? 'move' : 'inherit',
              }}
            >
              {el.text}
            </div>
          );
        } else if (el.type === 'rect') {
          body = (
            <div
              onPointerDown={(e) => handlePointerDownOnElement(e, el)}
              style={{ width: '100%', height: '100%', background: el.fill, border: el.stroke ? `${el.strokeWidth ?? 1}px solid ${el.stroke}` : undefined, borderRadius: el.radius ?? 0, cursor: activeTool === 'select' ? 'move' : 'inherit' }}
            />
          );
        } else if (el.type === 'ellipse') {
          body = (
            <div
              onPointerDown={(e) => handlePointerDownOnElement(e, el)}
              style={{ width: '100%', height: '100%', background: el.fill, border: el.stroke ? `${el.strokeWidth ?? 1}px solid ${el.stroke}` : undefined, borderRadius: '50%', cursor: activeTool === 'select' ? 'move' : 'inherit' }}
            />
          );
        } else if (el.type === 'line') {
          const weight = el.strokeWidth ?? 2;
          const lineStyle = el.lineStyle ?? 'solid';
          // A line's own box can be wide-and-flat (a horizontal rule) or
          // tall-and-thin (a vertical divider, e.g. a column separator) —
          // orient the drawn stroke to match, otherwise a vertical box only
          // ever paints a horizontal border-top pinned to its own vertical
          // center, collapsing to an invisible dot instead of a rule.
          const isVertical = el.h > el.w;
          // solid/dashed/dotted are native CSS border-style keywords —
          // render those via border-top/border-left. 'long-dash' and
          // 'dash-dot' have no native keyword, so those two are drawn with a
          // repeating background gradient instead, giving control over
          // exact dash/gap lengths that a border can't express.
          const lineInnerStyle: React.CSSProperties =
            lineStyle === 'long-dash'
              ? isVertical
                ? { height: '100%', width: weight, backgroundImage: `repeating-linear-gradient(to bottom, ${el.fill} 0, ${el.fill} ${weight * 6}px, transparent ${weight * 6}px, transparent ${weight * 9}px)` }
                : { width: '100%', height: weight, backgroundImage: `repeating-linear-gradient(to right, ${el.fill} 0, ${el.fill} ${weight * 6}px, transparent ${weight * 6}px, transparent ${weight * 9}px)` }
              : lineStyle === 'dash-dot'
              ? isVertical
                ? { height: '100%', width: weight, backgroundImage: `repeating-linear-gradient(to bottom, ${el.fill} 0, ${el.fill} ${weight * 4}px, transparent ${weight * 4}px, transparent ${weight * 6}px, ${el.fill} ${weight * 6}px, ${el.fill} ${weight * 7}px, transparent ${weight * 7}px, transparent ${weight * 9}px)` }
                : { width: '100%', height: weight, backgroundImage: `repeating-linear-gradient(to right, ${el.fill} 0, ${el.fill} ${weight * 4}px, transparent ${weight * 4}px, transparent ${weight * 6}px, ${el.fill} ${weight * 6}px, ${el.fill} ${weight * 7}px, transparent ${weight * 7}px, transparent ${weight * 9}px)` }
              : isVertical
              ? { height: '100%', borderLeft: `${weight}px ${lineStyle} ${el.fill}` }
              : { width: '100%', borderTop: `${weight}px ${lineStyle} ${el.fill}` };
          // Rendered via border/background rather than a filled block so
          // dashed/dotted/etc. lines are possible — the bounding box stays a
          // comfortable drag/resize target even when the line itself is thin.
          body = (
            <div
              onPointerDown={(e) => handlePointerDownOnElement(e, el)}
              style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                alignItems: isVertical ? 'stretch' : 'center',
                justifyContent: isVertical ? 'center' : 'flex-start',
                cursor: activeTool === 'select' ? 'move' : 'inherit',
              }}
            >
              <div style={lineInnerStyle} />
            </div>
          );
        } else if (el.type === 'image') {
          // draggable={false} — browsers make <img> elements natively
          // HTML5-draggable by default, which hijacks the very first
          // pointermove into the browser's own "ghost image" drag instead
          // of our custom pointer-based drag logic, breaking dragging for
          // image/signature elements specifically (text/shapes don't have
          // this native behavior, which is why only images looked broken).
          body = (
            <img
              src={el.src}
              alt=""
              draggable={false}
              onPointerDown={(e) => handlePointerDownOnElement(e, el)}
              style={{ width: '100%', height: '100%', objectFit: 'contain', cursor: activeTool === 'select' ? 'move' : 'inherit' }}
            />
          );
        } else if (el.type === 'table') {
          const isEditingCell = (row: number, col: number) =>
            !!editingCell && editingCell.elId === el.id && editingCell.row === row && editingCell.col === col;
          const isSelectedCell = (row: number, col: number) =>
            !!selectedCell && selectedCell.elId === el.id && selectedCell.row === row && selectedCell.col === col;
          const cellFormat = (row: number, col: number) => el.cellFormats?.[`${row === -1 ? 'h' : row}-${col}`];
          const commitCell = (row: number, col: number, value: string) => {
            if (row === -1) {
              onUpdate(el.id, { columns: el.columns.map((c, i) => (i === col ? { ...c, label: value } : c)) } as Partial<InvoiceElement>);
            } else {
              onUpdate(el.id, { rows: el.rows.map((r, ri) => (ri === row ? r.map((cell, ci) => (ci === col ? value : cell)) : r)) } as Partial<InvoiceElement>);
            }
          };
          const justify = (align?: 'left' | 'center' | 'right') => (align === 'right' ? 'flex-end' : align === 'center' ? 'center' : 'flex-start');
          const handleCellClick = (e: React.MouseEvent, row: number, col: number) => {
            if (activeTool !== 'select' || isEditingCell(row, col)) return;
            e.stopPropagation();
            onSelect(el.id);
            onSelectCell({ elId: el.id, row, col });
          };
          const handleCellContextMenu = (e: React.MouseEvent, row: number, col: number) => {
            if (activeTool !== 'select' || !onContextMenu) return;
            e.preventDefault();
            e.stopPropagation();
            if (!selectedElementIds.includes(el.id)) onSelect(el.id);
            onSelectCell({ elId: el.id, row, col });
            onContextMenu(e, el.id, { elId: el.id, row, col });
          };
          // Cell-level formatting overrides the table's own defaults —
          // most cells never get one, so this stays cheap per-render.
          const cellStyle = (row: number, col: number, base: React.CSSProperties): React.CSSProperties => {
            const fmt = cellFormat(row, col);
            if (!fmt) return base;
            return {
              ...base,
              fontWeight: fmt.bold !== undefined ? (fmt.bold ? 700 : 400) : base.fontWeight,
              fontStyle: fmt.italic ? 'italic' : base.fontStyle,
              textDecoration: fmt.underline ? 'underline' : base.textDecoration,
              color: fmt.color || base.color,
              fontSize: fmt.fontSize ?? base.fontSize,
              justifyContent: fmt.align ? justify(fmt.align) : base.justifyContent,
            };
          };
          body = (
            <div
              onPointerDown={(e) => { if (!editingCell || editingCell.elId !== el.id) handlePointerDownOnElement(e, el); else e.stopPropagation(); }}
              style={{
                width: '100%', height: '100%', display: 'flex', flexDirection: 'column', boxSizing: 'border-box',
                border: `1px solid ${el.borderColor}`, fontSize: el.fontSize, fontFamily: "'Inter', sans-serif",
                cursor: activeTool === 'select' ? 'move' : 'inherit', overflow: 'hidden',
              }}
            >
              <div style={{ display: 'flex', height: el.headerHeight, background: el.headerBg, flexShrink: 0 }}>
                {el.columns.map((col, ci) => (
                  <div
                    key={ci}
                    contentEditable={isEditingCell(-1, ci)}
                    suppressContentEditableWarning
                    onClick={(e) => handleCellClick(e, -1, ci)}
                    onDoubleClick={(e) => handleCellDoubleClick(e, el.id, -1, ci)}
                    onContextMenu={(e) => handleCellContextMenu(e, -1, ci)}
                    onBlur={(e) => { if (isEditingCell(-1, ci)) { commitCell(-1, ci, e.currentTarget.textContent || ''); setEditingCell(null); } }}
                    style={cellStyle(-1, ci, {
                      width: col.width, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: justify(col.align),
                      padding: '0 6px', fontWeight: 700, color: el.headerColor,
                      borderRight: ci < el.columns.length - 1 ? `1px solid ${el.borderColor}` : undefined,
                      outline: isEditingCell(-1, ci) ? '1px dashed currentColor' : isSelectedCell(-1, ci) ? '1.5px solid #6d28d9' : 'none',
                      outlineOffset: isSelectedCell(-1, ci) ? -1.5 : undefined,
                      overflow: 'hidden', whiteSpace: 'nowrap',
                    })}
                  >
                    {col.label}
                  </div>
                ))}
              </div>
              {el.rows.map((row, ri) => (
                <div
                  key={ri}
                  style={{
                    display: 'flex', height: el.rowHeight, borderTop: `1px solid ${el.borderColor}`, flexShrink: 0,
                    background: el.rowStripeColor && ri % 2 === 1 ? el.rowStripeColor : undefined,
                  }}
                >
                  {row.map((cell, ci) => (
                    <div
                      key={ci}
                      contentEditable={isEditingCell(ri, ci)}
                      suppressContentEditableWarning
                      onClick={(e) => handleCellClick(e, ri, ci)}
                      onDoubleClick={(e) => handleCellDoubleClick(e, el.id, ri, ci)}
                      onContextMenu={(e) => handleCellContextMenu(e, ri, ci)}
                      onBlur={(e) => { if (isEditingCell(ri, ci)) { commitCell(ri, ci, e.currentTarget.textContent || ''); setEditingCell(null); } }}
                      style={cellStyle(ri, ci, {
                        width: el.columns[ci]?.width ?? 100, flexShrink: 0, display: 'flex', alignItems: 'center',
                        justifyContent: justify(el.columns[ci]?.align), padding: '0 6px', color: el.cellColor,
                        borderRight: ci < row.length - 1 ? `1px solid ${el.borderColor}` : undefined,
                        outline: isEditingCell(ri, ci) ? '1px dashed currentColor' : isSelectedCell(ri, ci) ? '1.5px solid #6d28d9' : 'none',
                        outlineOffset: isSelectedCell(ri, ci) ? -1.5 : undefined,
                        overflow: 'hidden', whiteSpace: 'nowrap',
                      })}
                    >
                      {cell}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          );
        }

        return (
          <div
            key={el.id}
            style={commonStyle}
            data-element-id={el.id}
            // Only swallow the click while selecting — with a shape/text tool
            // active, clicks must fall through to the canvas so a new element
            // can be drawn even over an existing one's (often mostly-empty)
            // bounding box, matching how Figma's drawing tools behave.
            onClick={(e) => { if (activeTool === 'select') e.stopPropagation(); }}
            onContextMenu={(e) => {
              if (activeTool !== 'select' || !onContextMenu) return;
              e.preventDefault();
              e.stopPropagation();
              // Right-clicking a member of the current multi-selection keeps
              // the whole selection intact (so "Delete"/"Bring to front" etc.
              // apply to all of them) — right-clicking anything else selects
              // just that one element first, same as every other app.
              if (!selectedElementIds.includes(el.id)) onSelect(el.id);
              onContextMenu(e, el.id);
            }}
          >
            {body}
            {isSelected && (
              <>
                <div className="pointer-events-none absolute -inset-[3px] border-2 border-brand-500" />
                {/* Resize handles only make sense for a single selection —
                    dragging a corner with multiple elements selected would
                    be ambiguous about which one's being resized. */}
                {isPrimarySelection && selectedElementIds.length === 1 && (['nw', 'ne', 'sw', 'se'] as const).map((corner) => (
                  <div
                    key={corner}
                    onPointerDown={(e) => handleResizeStart(e, el, corner)}
                    className="absolute w-2.5 h-2.5 bg-white border-2 border-brand-500 rounded-full"
                    style={{
                      top: corner.includes('n') ? -6 : undefined,
                      bottom: corner.includes('s') ? -6 : undefined,
                      left: corner.includes('w') ? -6 : undefined,
                      right: corner.includes('e') ? -6 : undefined,
                      cursor: `${corner}-resize`,
                    }}
                  />
                ))}
                {/* Rotate handle — sits in the element's own local (already
                    rotated) coordinate space along with everything else
                    here, since the rotation transform is on the shared
                    parent, so it visually follows the element's current
                    angle automatically without any extra math. */}
                {isPrimarySelection && selectedElementIds.length === 1 && !el.locked && (
                  <>
                    <div className="pointer-events-none absolute w-px h-4 bg-brand-500" style={{ top: -24, left: '50%', transform: 'translateX(-50%)' }} />
                    <div
                      onPointerDown={(e) => handleRotateStart(e, el)}
                      title="Drag to rotate (Shift snaps to 15°)"
                      className="absolute w-3 h-3 bg-white border-2 border-brand-500 rounded-full"
                      style={{ top: -30, left: '50%', transform: 'translateX(-50%)', cursor: 'grab' }}
                    />
                  </>
                )}
              </>
            )}
          </div>
        );
      })}
      {marqueeBox && (
        <div
          className="absolute border border-brand-500 bg-brand-500/10 pointer-events-none"
          style={{ left: marqueeBox.x, top: marqueeBox.y, width: marqueeBox.w, height: marqueeBox.h }}
        />
      )}
    </div>
  );
};

export default InvoiceCanvas;
