import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  MessageSquare,
  LayoutTemplate,
  ChevronRight,
  Type,
  Sliders,
  Download,
  Loader2,
  Settings,
  MousePointer2,
  Square,
  Circle,
  Minus,
  TypeIcon,
  RotateCcw,
  ChevronDown,
  Upload as UploadIcon,
  PenTool,
  X,
  LayoutGrid,
  Copy,
  ClipboardPaste,
  Scissors,
  Trash2,
  BringToFront,
  SendToBack,
  FlipHorizontal2,
  FlipVertical2,
  Group,
  Ungroup,
  Lock,
  Unlock,
  Layers,
  Table as TableIcon,
  Rows3,
  Columns3,
} from 'lucide-react';
import { useChatStore } from '../store/chatStore';
import { useDocumentStore, SAMPLE_DOCUMENT_DATA } from '../store/documentStore';
import { useQuotaStore } from '../store/quotaStore';
import { trackButtonClick } from '../api/analytics';
import type { DocumentType } from '../types';
import { DOCUMENT_TYPES } from '../types';
import type { InvoiceElement } from '../types/canvasElement';
import DocumentTypeSelector from '../components/landing/DocumentTypeSelector';
import ChatPanel from '../components/builder/ChatPanel';
import TemplateSelector from '../components/builder/TemplateSelector';
import UpgradeModal from '../components/shared/UpgradeModal';
import GuestDownloadModal from '../components/shared/GuestDownloadModal';
import { withExportFontMetrics } from '../utils/exportFontMetrics';
import { useAuthStore } from '../store/authStore';
import ToolkitTabButton from '../components/builder/ToolkitTabButton';
import InvoiceCanvas, { type TableCellRef } from '../components/builder/InvoiceCanvas';
import ElementInspector from '../components/builder/ElementInspector';
import MultiElementInspector from '../components/builder/MultiElementInspector';
import LayersPanel from '../components/builder/LayersPanel';
import FontFacePicker from '../components/builder/FontFacePicker';
import { loadGoogleFont } from '../utils/googleFonts';
import AssetModal from '../components/builder/AssetModal';
import ExportPanel, { type ExportOptions } from '../components/builder/ExportPanel';
import CanvasContextMenu, { type ContextMenuEntry } from '../components/builder/CanvasContextMenu';

import { renderTemplate } from '../utils/templateRenderer';

type ToolkitTab = 'uploads' | 'signature' | 'fonts' | 'templates' | 'inspector' | 'layers' | 'export';


// Order: pick a template, edit the design, pick a theme color, add brand
// assets (logo/signature), adjust typography, then export.
const TOOLKIT_TABS: { tab: ToolkitTab; title: string; icon: React.ReactNode }[] = [
  { tab: 'templates', title: 'Choose Template', icon: <LayoutTemplate size={16} /> },
  { tab: 'inspector', title: 'Design', icon: <Sliders size={16} /> },
  { tab: 'layers', title: 'Layers', icon: <Layers size={16} /> },
  { tab: 'uploads', title: 'Uploads', icon: <UploadIcon size={16} /> },
  { tab: 'signature', title: 'Signature', icon: <PenTool size={16} /> },
  { tab: 'fonts', title: 'Typography', icon: <Type size={16} /> },
  { tab: 'export', title: 'Export', icon: <Download size={16} /> },
];

const PAGE_SIZE_PRESETS: { label: string; w: number; h: number }[] = [
  { label: 'A4', w: 595, h: 842 },
  { label: 'A4 Landscape', w: 842, h: 595 },
  { label: 'US Letter', w: 612, h: 792 },
  { label: 'Square', w: 800, h: 800 },
];

import { useSearchParams, useNavigate } from 'react-router-dom';

const BuilderPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const { isInitializing: authInitializing, user: authUser, isGuest, isAuthenticated } = useAuthStore();
  const downloadBlocked = isGuest || !isAuthenticated;
  const navigate = useNavigate();
  const { sessionId, documentType, startSession, resetChat, collectedData, collectedSlots, loadSessionFromDb, error: chatError } = useChatStore();
  const {
    fetchTemplates, resetDocument, previewHtml, isGenerating, isExporting, exportPdf, error: documentError,
    accentColor, updateLayout, layoutState, selectedTemplate,
    canvasElements, selectedElementId, selectedElementIds, activeTool,
    selectElement, selectElements, updateElement, updateElements, addElement, deleteElement, deleteElements,
    setActiveTool, refreshCanvasElements, resetElementLayout, checkpointHistory, undo, redo,
    uploadedAssets, addUploadedAsset, removeUploadedAsset,
    pageSelected, pageWidth, pageHeight, pageBackgroundColor, showGrid,
    selectPage, setPageSize, setPageBackgroundColor, setShowGrid,
  } = useDocumentStore();
  const { fetchQuota, setShowUpgradeModal, setShowGuestDownloadModal } = useQuotaStore();

  const activeSampleData = SAMPLE_DOCUMENT_DATA[documentType || 'invoice'] || SAMPLE_DOCUMENT_DATA.invoice;
  const activeData = (collectedSlots && Object.keys(collectedSlots).length > 0) ? collectedSlots : (collectedData || (useAuthStore.getState().user?.user_id==='demo-user-001'?activeSampleData:{}));


  const handledSearchRef = useRef<string | null>(null);
  const handledTypeParamRef = useRef<string | null>(null);
  const [isStartingSession, setIsStartingSession] = useState(false);
  const [lastAttemptedType, setLastAttemptedType] = useState<DocumentType | null>(null);

  useEffect(() => {
    if (authInitializing) return;
    const urlSessionId = searchParams.get('sessionId') || searchParams.get('id');
    const isNew = searchParams.get('new') === 'true';
    const currentSearch = searchParams.toString();

    if (isNew) {
      if (handledSearchRef.current !== currentSearch) {
        handledSearchRef.current = currentSearch;
        resetChat();
        resetDocument();
      }
    } else if (urlSessionId && urlSessionId !== sessionId) {
      loadSessionFromDb(urlSessionId);
    }
  }, [searchParams, sessionId, loadSessionFromDb, resetChat, resetDocument, authInitializing, authUser?.user_id]);

  // Landing page document-type cards (Invoice/Quotation/Receipt/Purchase
  // Order) link here as /builder?type=invoice so clicking one skips the
  // "What would you like to create?" selector screen and jumps straight
  // into that document type — only fires once per param value. Deliberately
  // NOT gated on `!sessionId`: handleSelectDocType is designed to safely
  // switch type mid-session (same function the toolkit's own type dropdown
  // calls), so clicking e.g. "Receipt" while an Invoice session is already
  // open from a previous visit must still switch it, not silently no-op.
  useEffect(() => {
    const urlType = searchParams.get('type') as DocumentType | null;
    const validTypes: DocumentType[] = ['invoice', 'quotation', 'receipt', 'purchase_order'];
    if (
      urlType &&
      validTypes.includes(urlType) &&
      !searchParams.get('sessionId') &&
      !searchParams.get('id') &&
      handledTypeParamRef.current !== urlType
    ) {
      handledTypeParamRef.current = urlType;
      handleSelectDocType(urlType);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Collapsible panels states
  const [chatCollapsed, setChatCollapsed] = useState(false);
  // Below ~1100px the desktop 3-panel layout (chat + canvas + toolkit) has
  // nowhere to put itself — no amount of squeezing makes hand-editing a
  // 595px-wide canvas usable on a phone or small tablet. Rather than a
  // broken partial layout, small screens get a single-column chat-first
  // view instead (generate/refine via AI, view a read-only preview,
  // download) — actual drag/resize/rotate design editing stays desktop-only.
  const [mobileTab, setMobileTab] = useState<'chat' | 'preview'>('chat');
  // `zoom` is always a percentage RELATIVE to "fit" — 100% means "fits the
  // panel", matching Word/Docs, not a literal 1:1 CSS scale. `fitScale` is
  // the actual CSS scale that achieves that fit for the current panel size;
  // the two multiply together for the real on-screen transform. This is
  // what fixes "100% shows 76% with a big margin" — zoom no longer needs to
  // change just because the window resized, only fitScale does.
  const [zoom, setZoom] = useState<number>(100);
  const [fitScale, setFitScale] = useState<number>(1);
  const [zoomInputValue, setZoomInputValue] = useState<string | null>(null);

  // Toolkit Panel (Panel 4) states — open by default with Choose Template
  // active, so it's immediately obvious there's a toolkit here rather than
  // making the user discover a collapsed strip on their own.
  const [toolkitCollapsed, setToolkitCollapsed] = useState(false);
  const [activeToolkitTab, setActiveToolkitTab] = useState<ToolkitTab>('templates');

  // The toolkit drawer's scroll container is one persistent DOM element
  // shared by every tab (Templates, Branding, Element, ...) — only its
  // content swaps, so its scrollTop otherwise carries over from whatever
  // tab was open before. Reset it to the top whenever the tab (or the
  // drawer opening at all) changes, so e.g. Choose Template always opens
  // scrolled to the top instead of wherever the previous tab left off.
  const toolkitScrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (toolkitScrollRef.current) toolkitScrollRef.current.scrollTop = 0;
  }, [activeToolkitTab, toolkitCollapsed]);

  // The scroll container the zoom/keyboard shortcuts below are scoped to —
  // wheel-zoom only kicks in while the pointer is actually over the canvas.
  const previewAreaRef = useRef<HTMLDivElement>(null);

  // Kept in refs (not effect deps) so the listeners below attach once and
  // stay in sync without re-subscribing on every drag-driven re-render.
  const canvasElementsRef = useRef(canvasElements);
  useLayoutEffect(() => { canvasElementsRef.current = canvasElements; });
  const selectedElementIdRef = useRef(selectedElementId);
  useLayoutEffect(() => { selectedElementIdRef.current = selectedElementId; });
  const selectedElementIdsRef = useRef(selectedElementIds);
  useLayoutEffect(() => { selectedElementIdsRef.current = selectedElementIds; });

  // Contain-fit — the WHOLE 595x842 page fits inside the panel at once
  // (both width and height), same idea as "fit to screen" in a PDF viewer.
  // This scale is the CSS multiplier for "100%" (= fit); it's recomputed
  // whenever the panel resizes, but the user-facing `zoom` percentage
  // itself never has to change because of it — it always just reads 100%.
  const computeFitScale = () => {
    const el = previewAreaRef.current;
    if (!el || !el.clientWidth || !el.clientHeight) return 1;
    // clientWidth/clientHeight include this element's own padding — and
    // its top padding is deliberately large (see the pt-14/pt-16 below) to
    // clear the floating toolbar overlapping this panel. A flat margin
    // guess doesn't know about that reserved space, so the computed scale
    // came out too big and the page overflowed the actually-visible area,
    // needing a scroll to see the bottom. Reading the real computed
    // padding and subtracting it gives the TRUE available box.
    const style = getComputedStyle(el);
    const padTop = parseFloat(style.paddingTop) || 0;
    const padBottom = parseFloat(style.paddingBottom) || 0;
    const padLeft = parseFloat(style.paddingLeft) || 0;
    const padRight = parseFloat(style.paddingRight) || 0;
    const margin = 16;
    const scaleW = (el.clientWidth - padLeft - padRight - margin * 2) / pageWidth;
    const scaleH = (el.clientHeight - padTop - padBottom - margin * 2) / pageHeight;
    return Math.max(0.1, Math.min(scaleW, scaleH));
  };
  // Always-fresh handle to the function above — a plain useEffect keyed on
  // `sessionId` to attach the ResizeObserver/wheel listener turned out to
  // be unreliable: `previewAreaRef.current` was still null whenever this
  // ran before the ref-holding div's own commit landed (e.g. sessionId
  // already true on mount from persisted state, no null→truthy transition
  // to re-trigger the effect), silently leaving Ctrl+scroll zoom dead with
  // no visible error. A callback ref sidesteps the timing question
  // entirely — it fires exactly when the DOM node itself appears/
  // disappears, never "maybe before, maybe after" relative to an effect.
  const computeFitScaleRef = useRef(computeFitScale);
  useLayoutEffect(() => { computeFitScaleRef.current = computeFitScale; });

  const previewAreaCleanupRef = useRef<(() => void) | null>(null);
  const setPreviewAreaRef = useCallback((node: HTMLDivElement | null) => {
    previewAreaCleanupRef.current?.();
    previewAreaCleanupRef.current = null;
    previewAreaRef.current = node;
    if (!node) return;

    setFitScale(computeFitScaleRef.current());
    const observer = new ResizeObserver(() => setFitScale(computeFitScaleRef.current()));
    observer.observe(node);

    // Ctrl+scroll to zoom — on Mac, trackpad pinch-to-zoom is reported by
    // the browser as a wheel event with ctrlKey set, so checking ctrlKey
    // alone covers both an actual held Ctrl key (Windows/Mac) and a
    // trackpad pinch. `{ passive: false }` is required for preventDefault
    // to actually suppress the browser's native page-zoom — React's own
    // onWheel prop attaches passively by default and can't do this.
    const handleWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      setZoom((z) => Math.max(25, Math.min(400, Math.round(z - Math.sign(e.deltaY) * 5))));
    };
    node.addEventListener('wheel', handleWheel, { passive: false });

    previewAreaCleanupRef.current = () => {
      observer.disconnect();
      node.removeEventListener('wheel', handleWheel);
    };

  }, []);

  // The callback ref above only re-fires on actual mount/unmount of the
  // panel div — page-size presets can change pageWidth/pageHeight while
  // that div stays mounted the whole time, so this recomputes the fit
  // baseline for that case specifically (not listener attachment, which
  // doesn't need to change here).
  useEffect(() => {
    if (previewAreaRef.current) setFitScale(computeFitScaleRef.current());
  }, [pageWidth, pageHeight]);

  // In-memory clipboard for Ctrl/Cmd+C / +V / +X — copying base template
  // elements pastes new independent (movable, deletable) custom copies.
  // Always an array so multi-selection copy/paste/cut works the same as a
  // single element.
  const clipboardRef = useRef<InvoiceElement[]>([]);
  const [clipboard, setClipboard] = useState<InvoiceElement[]>([]);

  // Canva/Figma-style keyboard shortcuts for the editable canvas. Ctrl on
  // Windows & Linux, Cmd on Mac — checking both covers each platform. Every
  // selection-scoped shortcut below operates on the FULL multi-selection
  // (selectedElementIds), not just the last-clicked primary element.
  //   V / R / C / L / T          — switch tool: Select / Rectangle / Ellipse / Line / Text
  //   Delete, Backspace           — remove the selected (custom) elements
  //   Arrow keys                  — nudge the selection 1px, 10px with Shift, 20px with Ctrl/Cmd
  //   Shift + drag                — (in InvoiceCanvas) constrain drag to one axis
  //   Alt + drag                  — (in InvoiceCanvas) duplicate-drag
  //   Escape                      — deselect (or exit text editing, if typing)
  //   Ctrl/Cmd+A                  — select all elements
  //   Tab / Shift+Tab             — cycle the single selection forward/back
  //   Ctrl/Cmd+D / +J             — duplicate the selection
  //   Ctrl/Cmd+C / +V / +X        — copy / paste / cut the selection
  //   Ctrl/Cmd+] / +[             — bring forward / send backward one layer
  //   Ctrl/Cmd+Alt+] / +Alt+[     — bring to front / send to back
  //   Ctrl/Cmd+G / +Shift+G       — group / ungroup the selection
  //   Shift+H / Shift+V           — flip horizontal / vertical
  //   Ctrl/Cmd+B / +I / +U        — bold / italic / underline (selected text)
  //   Ctrl/Cmd+Shift+X            — strikethrough (selected text)
  //   Ctrl/Cmd+Shift+L / +C / +R  — align left / center / right (selected text)
  //   Ctrl/Cmd+Shift+> / +<       — increase / decrease font size (selected text)
  //   Alt+Shift+L                 — lock / unlock the selection
  //   Alt+, / Alt+.                — rotate -1° / +1°
  //   Alt+Shift+, / Alt+Shift+.    — rotate -15° / +15°
  //   Ctrl/Cmd+Z / +Shift+Z / +Y   — undo / redo
  //   Ctrl/Cmd + +/-/0            — zoom in / out / reset to fit
  useEffect(() => {
    const isTypingTarget = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) return false;
      return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      const typing = isTypingTarget(e.target);

      // Exit text editing without falling through to any canvas shortcut —
      // Canva's documented "Esc: exit text editing" behavior. Must run
      // before the `typing` early-return below, which otherwise swallows
      // every key (intentionally) while a contentEditable is focused.
      if (e.key === 'Escape' && typing) {
        if (e.target instanceof HTMLElement && e.target.isContentEditable) e.target.blur();
        return;
      }

      // Bold/Italic/Underline/Strikethrough/font-size/align shortcuts:
      // one fontSize/fontWeight/etc. per whole element (not per-character
      // spans), so they apply to the element being edited exactly like
      // clicking the inspector's own Bold button mid-edit — they need to
      // keep working while actively typing inside that element's
      // contentEditable, which the blanket `typing` early-return below
      // would otherwise swallow along with every other shortcut.
      const applyTextFormatShortcut = (): boolean => {
        const elements = canvasElementsRef.current;
        if (!elements) return false;
        const selectedId = selectedElementIdRef.current;
        const selectedIds = selectedElementIdsRef.current;
        const selectedTextIds = selectedIds.filter((id) => elements.find((el) => el.id === id)?.type === 'text');
        if (!mod || !selectedTextIds.length) return false;
        const primaryTextEl = selectedId ? elements.find((el): el is import('../types/canvasElement').TextElement => el.id === selectedId && el.type === 'text') : undefined;

        if (!e.shiftKey && e.key.toLowerCase() === 'b') {
          e.preventDefault();
          checkpointHistory();
          const bold = !(primaryTextEl && primaryTextEl.fontWeight >= 700);
          updateElements(selectedTextIds, { fontWeight: bold ? 700 : 400 } as Partial<InvoiceElement>);
          return true;
        }
        if (!e.shiftKey && e.key.toLowerCase() === 'i') {
          e.preventDefault();
          checkpointHistory();
          const italic = !(primaryTextEl && primaryTextEl.italic);
          updateElements(selectedTextIds, { italic } as Partial<InvoiceElement>);
          return true;
        }
        if (!e.shiftKey && e.key.toLowerCase() === 'u') {
          e.preventDefault();
          checkpointHistory();
          const underline = !(primaryTextEl && primaryTextEl.underline);
          updateElements(selectedTextIds, { underline } as Partial<InvoiceElement>);
          return true;
        }
        // On macOS, holding Cmd (metaKey) alongside Shift makes the browser
        // resolve `e.key` to the unshifted base character (',' / '.')
        // instead of the shifted symbol ('<' / '>') — a real hardware
        // quirk that synthetic KeyboardEvents don't reproduce. Fall back to
        // the physical `e.code`, which stays 'Comma'/'Period' regardless.
        const isDecreaseKey = e.key === '<' || e.code === 'Comma';
        const isIncreaseKey = e.key === '>' || e.code === 'Period';
        if (e.shiftKey && (isIncreaseKey || isDecreaseKey)) {
          e.preventDefault();
          checkpointHistory();
          const delta = isIncreaseKey ? 2 : -2;
          updateElements(selectedTextIds, (id) => {
            const el = elements.find((candidate) => candidate.id === id);
            const current = el && el.type === 'text' ? el.fontSize : 14;
            return { fontSize: Math.max(6, current + delta) } as Partial<InvoiceElement>;
          });
          return true;
        }
        if (e.shiftKey && e.key.toLowerCase() === 'x') {
          e.preventDefault();
          checkpointHistory();
          const strikethrough = !(primaryTextEl && primaryTextEl.strikethrough);
          updateElements(selectedTextIds, { strikethrough } as Partial<InvoiceElement>);
          return true;
        }
        if (e.shiftKey && ['l', 'c', 'r'].includes(e.key.toLowerCase())) {
          e.preventDefault();
          checkpointHistory();
          const key = e.key.toLowerCase();
          const align = key === 'l' ? 'left' : key === 'c' ? 'center' : 'right';
          updateElements(selectedTextIds, { align } as Partial<InvoiceElement>);
          return true;
        }
        return false;
      };

      if (mod && e.target instanceof HTMLElement && e.target.isContentEditable) {
        if (applyTextFormatShortcut()) return;
      }

      if (mod && !typing) {
        if (e.key === '=' || e.key === '+') { e.preventDefault(); setZoom((z) => Math.min(400, z + 10)); return; }
        if (e.key === '-') { e.preventDefault(); setZoom((z) => Math.max(25, z - 10)); return; }
        if (e.key === '0') { e.preventDefault(); setZoom(100); return; }

        if (!e.shiftKey && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(collectedData || activeSampleData); return; }
        if (e.shiftKey && e.key.toLowerCase() === 'z') { e.preventDefault(); redo(collectedData || activeSampleData); return; }
        if (e.key.toLowerCase() === 'y') { e.preventDefault(); redo(collectedData || activeSampleData); return; }
      }

      if (!canvasElementsRef.current || typing) return;
      const elements = canvasElementsRef.current;
      const selectedId = selectedElementIdRef.current;
      const selectedIds = selectedElementIdsRef.current;

      // Tool switching — no modifier held, matches Canva's T/R/C/L/V.
      // Shift is excluded so Shift+H / Shift+V (flip) below aren't
      // swallowed by the 'v' select-tool shortcut.
      if (!mod && !e.altKey && !e.shiftKey) {
        const key = e.key.toLowerCase();
        if (key === 'v') { setActiveTool('select'); return; }
        if (key === 'r') { setActiveTool('rect'); return; }
        if (key === 'c') { setActiveTool('ellipse'); return; }
        if (key === 'l') { setActiveTool('line'); return; }
        if (key === 't') { setActiveTool('text'); return; }
      }

      if (e.key === 'Escape') {
        selectElement(null);
        return;
      }

      if (mod && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        selectElements(elements.map((el) => el.id));
        return;
      }

      if (e.key === 'Tab' && elements.length) {
        e.preventDefault();
        const sortedIds = [...elements].sort((a, b) => a.zIndex - b.zIndex).map((el) => el.id);
        const currentIdx = selectedId ? sortedIds.indexOf(selectedId) : -1;
        const nextIdx = e.shiftKey
          ? (currentIdx <= 0 ? sortedIds.length - 1 : currentIdx - 1)
          : (currentIdx === -1 || currentIdx === sortedIds.length - 1 ? 0 : currentIdx + 1);
        selectElement(sortedIds[nextIdx]);
        setToolkitCollapsed(false);
        setActiveToolkitTab('inspector');
        return;
      }

      if (mod && !e.shiftKey && e.key.toLowerCase() === 'c' && selectedIds.length) {
        clipboardRef.current = elements.filter((el) => selectedIds.includes(el.id));
        setClipboard(clipboardRef.current);
        return;
      }

      if (mod && e.key.toLowerCase() === 'v' && clipboardRef.current.length) {
        e.preventDefault();
        const pastedIds: string[] = [];
        clipboardRef.current.forEach((copy, i) => {
          const newId = `custom_${Date.now()}_${Math.round(Math.random() * 1000)}_${i}`;
          pastedIds.push(newId);
          addElement({ ...copy, id: newId, x: copy.x + 16, y: copy.y + 16 });
        });
        selectElements(pastedIds);
        return;
      }

      if (!selectedIds.length) return;
      const selectedCustomIds = selectedIds.filter((id) => id.startsWith('custom_'));

      if (mod && !e.shiftKey && e.key.toLowerCase() === 'x') {
        clipboardRef.current = elements.filter((el) => selectedIds.includes(el.id));
        setClipboard(clipboardRef.current);
        if (selectedCustomIds.length) { e.preventDefault(); deleteElements(selectedCustomIds); }
        return;
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        // Matches the inspector panel's own delete button — only
        // user-added shapes/text are removable, template elements aren't.
        if (selectedCustomIds.length) { e.preventDefault(); deleteElements(selectedCustomIds); }
        return;
      }

      if (mod && e.key.toLowerCase() === 'g') {
        e.preventDefault();
        checkpointHistory();
        if (e.shiftKey) {
          updateElements(selectedIds, { groupId: undefined } as Partial<InvoiceElement>);
        } else if (selectedIds.length >= 2) {
          const groupId = `group_${Date.now()}`;
          updateElements(selectedIds, { groupId } as Partial<InvoiceElement>);
        }
        return;
      }

      if (!mod && e.shiftKey && (e.key.toLowerCase() === 'h' || e.key.toLowerCase() === 'v')) {
        e.preventDefault();
        checkpointHistory();
        const field = e.key.toLowerCase() === 'h' ? 'flipH' : 'flipV';
        updateElements(selectedIds, (id) => {
          const el = elements.find((candidate) => candidate.id === id);
          return { [field]: !el?.[field] } as Partial<InvoiceElement>;
        });
        return;
      }

      if (mod && (e.key.toLowerCase() === 'd' || e.key.toLowerCase() === 'j')) {
        if (selectedCustomIds.length) {
          e.preventDefault();
          const newIds: string[] = [];
          selectedCustomIds.forEach((id, i) => {
            const el = elements.find((candidate) => candidate.id === id);
            if (!el) return;
            const newId = `custom_${Date.now()}_${Math.round(Math.random() * 1000)}_${i}`;
            newIds.push(newId);
            addElement({ ...el, id: newId, x: el.x + 12, y: el.y + 12 });
          });
          if (newIds.length) selectElements(newIds);
        }
        return;
      }

      // Layer order — only meaningful for a single primary element, and
      // safe for any element, not just custom ones.
      if (mod && selectedId && (e.key === ']' || e.key === '[')) {
        e.preventDefault();
        const selectedEl = elements.find((el) => el.id === selectedId);
        if (selectedEl) {
          checkpointHistory();
          if (e.altKey) {
            const zs = elements.map((el) => el.zIndex);
            updateElement(selectedId, { zIndex: e.key === ']' ? Math.max(...zs) + 1 : Math.min(...zs) - 1 });
          } else {
            updateElement(selectedId, { zIndex: selectedEl.zIndex + (e.key === ']' ? 1 : -1) });
          }
        }
        return;
      }

      if (applyTextFormatShortcut()) return;

      if (e.altKey && e.shiftKey && e.key.toLowerCase() === 'l') {
        e.preventDefault();
        checkpointHistory();
        const primaryEl = elements.find((el) => el.id === selectedId);
        const locked = !primaryEl?.locked;
        updateElements(selectedIds, { locked } as Partial<InvoiceElement>);
        return;
      }

      if (e.altKey && (e.key === ',' || e.key === '.')) {
        e.preventDefault();
        checkpointHistory();
        const step = e.shiftKey ? 15 : 1;
        const delta = e.key === ',' ? -step : step;
        updateElements(selectedIds, (id) => {
          const el = elements.find((candidate) => candidate.id === id);
          return { rotation: (el?.rotation ?? 0) + delta };
        });
        return;
      }

      const step = mod ? 20 : e.shiftKey ? 10 : 1;
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        checkpointHistory();
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        updateElements(selectedIds, (id) => {
          const el = elements.find((candidate) => candidate.id === id);
          return { x: (el?.x ?? 0) + dx, y: (el?.y ?? 0) + dy };
        });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectElement, selectElements, updateElement, updateElements, deleteElements, addElement, setActiveTool, checkpointHistory, undo, redo, collectedData]);

  useEffect(() => {
    fetchQuota();
  }, [fetchQuota]);

  // Even before a document has been generated via chat, the sample preview
  // should already be a movable/editable canvas for templates that have an
  // element-model migration — not just once the "real" document exists.
  useEffect(() => {
    refreshCanvasElements(activeData);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTemplate, documentType, collectedSlots, collectedData]);

  // Clicking any canvas element loads its properties into the toolkit
  // immediately — expand the drawer and switch to the inspector view.
  const handleSelectElement = (id: string | null, options?: { additive?: boolean }) => {
    selectElement(id, options);
    if (id !== selectedCell?.elId) setSelectedCell(null);
    if (id) {
      setToolkitCollapsed(false);
      setActiveToolkitTab('inspector');
    } else if (activeToolkitTab === 'inspector') {
      setActiveToolkitTab('templates');
    }
  };

  // Double-clicking empty canvas selects "the page" itself — same drawer-
  // opening behavior as selecting an element, so its background/grid/size
  // controls in the Design tab are immediately visible.
  const handleSelectPage = () => {
    selectPage();
    setToolkitCollapsed(false);
    setActiveToolkitTab('inspector');
  };

  const selectedElement: InvoiceElement | null = canvasElements?.find((el) => el.id === selectedElementId) || null;
  const isSelectedElementCustom = selectedElementId?.startsWith('custom_') ?? false;
  const selectedElements: InvoiceElement[] = canvasElements
    ? selectedElementIds.map((id) => canvasElements.find((el) => el.id === id)).filter((el): el is InvoiceElement => !!el)
    : [];

  // Right-click context menu — Canva/Figma-style actions on whatever's
  // currently selected. Shares the same clipboardRef as the Ctrl/Cmd+C/V/X
  // keyboard shortcuts, so copying with one and pasting with the other
  // works interchangeably.
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; cell?: TableCellRef } | null>(null);
  // A single click on a table cell selects just that cell (for per-cell
  // formatting) — separate from selectedElementId, which still selects the
  // whole table (for position/size/move). Cleared whenever the selected
  // element changes to something other than that cell's own table.
  const [selectedCell, setSelectedCell] = useState<TableCellRef | null>(null);

  const ctxCopy = () => { clipboardRef.current = selectedElements; setClipboard(selectedElements); };
  const ctxCut = () => {
    clipboardRef.current = selectedElements; setClipboard(selectedElements);
    const deletable = selectedElementIds.filter((id) => id.startsWith('custom_'));
    if (deletable.length) deleteElements(deletable);
  };
  const ctxPaste = () => {
    if (!clipboardRef.current.length) return;
    const newIds: string[] = [];
    clipboardRef.current.forEach((copy, i) => {
      const newId = `custom_${Date.now()}_${Math.round(Math.random() * 1000)}_${i}`;
      newIds.push(newId);
      addElement({ ...copy, id: newId, x: copy.x + 16, y: copy.y + 16, groupId: undefined } as InvoiceElement);
    });
    selectElements(newIds);
  };
  // Duplicating works on ANY selected element (template or custom) — the
  // duplicate itself is always a fresh custom_ copy, so there's no reason
  // to restrict this to already-custom elements the way keyboard Ctrl/Cmd+D
  // historically did.
  const ctxDuplicate = () => {
    if (!selectedElements.length) return;
    const newIds: string[] = [];
    selectedElements.forEach((el, i) => {
      const newId = `custom_${Date.now()}_${Math.round(Math.random() * 1000)}_${i}`;
      newIds.push(newId);
      addElement({ ...el, id: newId, x: el.x + 12, y: el.y + 12, groupId: undefined } as InvoiceElement);
    });
    selectElements(newIds);
  };
  const ctxDelete = () => {
    const deletable = selectedElementIds.filter((id) => id.startsWith('custom_'));
    if (deletable.length) { deleteElements(deletable); handleSelectElement(null); }
  };
  const ctxReorder = (mode: 'forward' | 'backward' | 'front' | 'back') => {
    if (!selectedElementId || !canvasElements) return;
    checkpointHistory();
    if (mode === 'front' || mode === 'back') {
      const zs = canvasElements.map((el) => el.zIndex);
      updateElement(selectedElementId, { zIndex: mode === 'front' ? Math.max(...zs) + 1 : Math.min(...zs) - 1 });
    } else {
      updateElement(selectedElementId, { zIndex: selectedElement!.zIndex + (mode === 'forward' ? 1 : -1) });
    }
  };
  const ctxFlip = (axis: 'h' | 'v') => {
    if (!selectedElementIds.length) return;
    checkpointHistory();
    updateElements(selectedElementIds, (id) => {
      const el = canvasElements?.find((candidate) => candidate.id === id);
      return axis === 'h' ? { flipH: !el?.flipH } : { flipV: !el?.flipV };
    });
  };
  const ctxToggleLock = () => {
    if (!selectedElementIds.length) return;
    checkpointHistory();
    updateElements(selectedElementIds, { locked: !selectedElement?.locked } as Partial<InvoiceElement>);
  };
  const ctxGroup = () => {
    if (selectedElementIds.length < 2) return;
    checkpointHistory();
    const groupId = `group_${Date.now()}`;
    updateElements(selectedElementIds, { groupId } as Partial<InvoiceElement>);
  };
  const ctxUngroup = () => {
    if (!selectedElementIds.length) return;
    checkpointHistory();
    updateElements(selectedElementIds, { groupId: undefined } as Partial<InvoiceElement>);
  };
  const selectionIsGrouped = selectedElements.length > 0 && selectedElements.every((el) => el.groupId && el.groupId === selectedElements[0].groupId);

  // Table row/column operations — target the table + row/col the context
  // menu was opened on (contextMenu.cell), not necessarily the "primary"
  // selected element, since right-clicking a cell selects its table but a
  // multi-selection elsewhere could still be active.
  const ctxTable = () => {
    const cell = contextMenu?.cell;
    if (!cell) return null;
    const el = canvasElements?.find((candidate) => candidate.id === cell.elId);
    return el && el.type === 'table' ? { el, cell } : null;
  };
  const ctxInsertRow = (position: 'above' | 'below') => {
    const found = ctxTable();
    if (!found) return;
    const { el, cell } = found;
    checkpointHistory();
    const newRow = el.columns.map(() => '');
    const insertAt = cell.row === -1 ? 0 : position === 'above' ? cell.row : cell.row + 1;
    const newRows = [...el.rows.slice(0, insertAt), newRow, ...el.rows.slice(insertAt)];
    updateElement(el.id, { rows: newRows, h: el.headerHeight + newRows.length * el.rowHeight } as Partial<InvoiceElement>);
  };
  const ctxDeleteRow = () => {
    const found = ctxTable();
    if (!found || found.cell.row === -1 || found.el.rows.length <= 1) return;
    const { el, cell } = found;
    checkpointHistory();
    const newRows = el.rows.filter((_, i) => i !== cell.row);
    updateElement(el.id, { rows: newRows, h: el.headerHeight + newRows.length * el.rowHeight } as Partial<InvoiceElement>);
    setSelectedCell(null);
  };
  const ctxInsertColumn = (position: 'left' | 'right') => {
    const found = ctxTable();
    if (!found) return;
    const { el, cell } = found;
    checkpointHistory();
    const insertAt = position === 'left' ? cell.col : cell.col + 1;
    const newColumns = [...el.columns.slice(0, insertAt), { label: 'Column', width: 80, align: 'left' as const }, ...el.columns.slice(insertAt)];
    const newRows = el.rows.map((r) => [...r.slice(0, insertAt), '', ...r.slice(insertAt)]);
    updateElement(el.id, { columns: newColumns, rows: newRows, w: el.w + 80 } as Partial<InvoiceElement>);
  };
  const ctxDeleteColumn = () => {
    const found = ctxTable();
    if (!found || found.el.columns.length <= 1) return;
    const { el, cell } = found;
    checkpointHistory();
    const removedWidth = el.columns[cell.col].width;
    const newColumns = el.columns.filter((_, i) => i !== cell.col);
    const newRows = el.rows.map((r) => r.filter((_, i) => i !== cell.col));
    updateElement(el.id, { columns: newColumns, rows: newRows, w: Math.max(60, el.w - removedWidth) } as Partial<InvoiceElement>);
    setSelectedCell(null);
  };

  // Every distinct color used anywhere in the document, for the inspector
  // panels' quick-pick swatches — recomputed only when elements actually
  // change, not on every render (selection changes shouldn't recompute it).
  const documentColors = useMemo(() => {
    if (!canvasElements) return [];
    const colors = new Set<string>();
    canvasElements.forEach((el) => {
      if (el.type === 'text') colors.add(el.color);
      if (el.type === 'rect' || el.type === 'ellipse' || el.type === 'line') colors.add(el.fill);
      if (el.type === 'table') { colors.add(el.headerBg); colors.add(el.headerColor); colors.add(el.cellColor); colors.add(el.borderColor); }
      if ('stroke' in el && el.stroke) colors.add(el.stroke);
      if (el.shadowEnabled && el.shadowColor) colors.add(el.shadowColor);
    });
    colors.delete('');
    colors.delete('transparent');
    return Array.from(colors);
  }, [canvasElements]);

  // "Document font" in the Typography tab — the font shown as currently
  // active whenever every text element already shares one (falls back to
  // 'Inter' on an empty/mixed document, matching the field's old default).
  const documentFontFamily = useMemo(() => {
    if (!canvasElements) return 'Inter';
    const textFonts = canvasElements.filter((el) => el.type === 'text').map((el) => el.fontFamily || 'Inter');
    if (!textFonts.length) return 'Inter';
    return textFonts.every((f) => f === textFonts[0]) ? textFonts[0] : 'Inter';
  }, [canvasElements]);

  // Applying a document font previously called updateLayout('global', ...),
  // which is a no-op until a documentId exists (server-persisted layout) —
  // meaning it silently did nothing on the canvas during normal editing.
  // Sets fontFamily directly on every text element instead — nothing else
  // about each one (weight/italic/underline/size/color/etc.) changes.
  const applyDocumentFont = (family: string) => {
    if (!canvasElements) return;
    loadGoogleFont(family);
    const textIds = canvasElements.filter((el) => el.type === 'text').map((el) => el.id);
    if (!textIds.length) return;
    checkpointHistory();
    updateElements(textIds, { fontFamily: family } as Partial<InvoiceElement>);
    updateLayout('global', { fontFamily: family });
  };

  // Layers panel reorders by drag-and-drop — translate the new front-to-back
  // id order back into concrete zIndex values (front-most gets the highest).
  const handleLayersReorder = (frontToBackIds: string[]) => {
    const total = frontToBackIds.length;
    frontToBackIds.forEach((id, index) => updateElement(id, { zIndex: total - index }));
  };

  const contextMenuTableEntries: ContextMenuEntry[] = ctxTable() ? [
    { label: 'Insert row above', icon: <Rows3 size={14} />, onClick: () => ctxInsertRow('above') },
    { label: 'Insert row below', icon: <Rows3 size={14} />, onClick: () => ctxInsertRow('below') },
    { label: 'Insert column left', icon: <Columns3 size={14} />, onClick: () => ctxInsertColumn('left') },
    { label: 'Insert column right', icon: <Columns3 size={14} />, onClick: () => ctxInsertColumn('right') },
    { label: 'Delete row', icon: <Trash2 size={14} />, onClick: ctxDeleteRow, danger: true, disabled: contextMenu?.cell?.row === -1 || (ctxTable()?.el.rows.length ?? 0) <= 1 },
    { label: 'Delete column', icon: <Trash2 size={14} />, onClick: ctxDeleteColumn, danger: true, disabled: (ctxTable()?.el.columns.length ?? 0) <= 1 },
    { divider: true },
  ] : [];

  const contextMenuItems: ContextMenuEntry[] = selectedElement || selectedElements.length > 1 ? [
    ...contextMenuTableEntries,
    { label: 'Copy', icon: <Copy size={14} />, shortcut: '⌘C', onClick: ctxCopy },
    { label: 'Paste', icon: <ClipboardPaste size={14} />, shortcut: '⌘V', onClick: ctxPaste, disabled: !clipboard.length },
    { label: 'Cut', icon: <Scissors size={14} />, shortcut: '⌘X', onClick: ctxCut, disabled: !isSelectedElementCustom && selectedElements.length <= 1 },
    { label: 'Duplicate', icon: <Copy size={14} />, shortcut: '⌘D', onClick: ctxDuplicate },
    { divider: true },
    { label: 'Bring to front', icon: <BringToFront size={14} />, shortcut: '⌘⌥]', onClick: () => ctxReorder('front'), disabled: selectedElements.length !== 1 },
    { label: 'Bring forward', icon: <BringToFront size={14} />, shortcut: '⌘]', onClick: () => ctxReorder('forward'), disabled: selectedElements.length !== 1 },
    { label: 'Send backward', icon: <SendToBack size={14} />, shortcut: '⌘[', onClick: () => ctxReorder('backward'), disabled: selectedElements.length !== 1 },
    { label: 'Send to back', icon: <SendToBack size={14} />, shortcut: '⌘⌥[', onClick: () => ctxReorder('back'), disabled: selectedElements.length !== 1 },
    { divider: true },
    { label: 'Flip horizontal', icon: <FlipHorizontal2 size={14} />, shortcut: '⇧H', onClick: () => ctxFlip('h') },
    { label: 'Flip vertical', icon: <FlipVertical2 size={14} />, shortcut: '⇧V', onClick: () => ctxFlip('v') },
    { divider: true },
    ...(selectedElements.length > 1
      ? [selectionIsGrouped
          ? { label: 'Ungroup', icon: <Ungroup size={14} />, shortcut: '⌘⇧G', onClick: ctxUngroup }
          : { label: 'Group selection', icon: <Group size={14} />, shortcut: '⌘G', onClick: ctxGroup }]
      : []),
    { label: selectedElement?.locked ? 'Unlock' : 'Lock', icon: selectedElement?.locked ? <Unlock size={14} /> : <Lock size={14} />, shortcut: '⌥⇧L', onClick: ctxToggleLock },
    { divider: true },
    { label: 'Delete', icon: <Trash2 size={14} />, shortcut: 'Del', onClick: ctxDelete, danger: true, disabled: !selectedElementIds.some((id) => id.startsWith('custom_')) },
  ] : [
    { label: 'Paste', icon: <ClipboardPaste size={14} />, shortcut: '⌘V', onClick: ctxPaste, disabled: !clipboard.length },
  ];

  const CANVAS_TOOLS: { tool: 'select' | 'rect' | 'ellipse' | 'line' | 'text'; icon: React.ReactNode; title: string }[] = [
    { tool: 'select', icon: <MousePointer2 size={13} />, title: 'Select (V)' },
    { tool: 'rect', icon: <Square size={13} />, title: 'Rectangle (R)' },
    { tool: 'ellipse', icon: <Circle size={13} />, title: 'Ellipse (C)' },
    { tool: 'line', icon: <Minus size={13} />, title: 'Line (L)' },
    { tool: 'text', icon: <TypeIcon size={13} />, title: 'Text (T)' },
  ];

  // Deliberately does NOT call resetChat() first — resetChat() nulls out
  // sessionId synchronously, and startSession() is async (500ms in demo
  // mode), so there'd be a real gap where sessionId is null. Since this is
  // also called from the toolkit's document-type dropdown while a session
  // is already active (not just the first-time DocumentTypeSelector
  // screen), that gap made the whole "What would you like to create?"
  // full-screen selector flash on every switch (BuilderPage falls back to
  // it whenever !sessionId). startSession() already resets everything that
  // actually matters (sessionId, messages, fields) in one atomic set(), so
  // there's no null gap; the couple of fields it doesn't touch are cleared
  // right after, once the new session is already live.
  async function handleSelectDocType(type: DocumentType) {
    setLastAttemptedType(type);
    setIsStartingSession(true);
    try {
      resetDocument();
      await fetchTemplates(type);
      const document = useDocumentStore.getState();
      if (!document.templates.length || !document.selectedTemplate) {
        useChatStore.setState({ error: document.error || 'No templates are currently available for this document type. Please try again.' });
        return;
      }
      await startSession(type);
      useChatStore.setState({ pendingCorrection: null, summary: null, collectedData: null, spellCorrections: [] });
    } catch (error) {
      useChatStore.setState({ error: error instanceof Error ? error.message : 'Could not open your workspace. Please try again.' });
    } finally {
      setIsStartingSession(false);
    }
  };

  const handleBackToSelector = () => {
    handledSearchRef.current = null;
    resetChat();
    resetDocument();
  };

  // Drops a freshly uploaded/drawn asset straight onto the canvas as a new
  // movable/resizable image element — clicking an existing thumbnail in the
  // Uploads/Signature grid re-inserts another copy the same way. Lands on
  // the LAST page rather than a fixed y:300 (= always page 1's coordinate
  // space) — on a multi-page document that fixed offset silently dropped
  // the new image onto page 1 even while working on page 3, appearing to
  // do nothing since it was out of view.
  const insertAssetOntoCanvas = (dataUrl: string) => {
    const id = `custom_${crypto.randomUUID()}`;
    const maxContentY = Math.max(pageHeight, ...(canvasElements || []).map((el) => el.y + (el.h || 20)));
    const lastPageIndex = Math.max(0, Math.ceil(maxContentY / pageHeight) - 1);
    addElement({ id, type: 'image', src: dataUrl, x: 180, y: lastPageIndex * pageHeight + 300, w: 200, h: 120, section: 'custom', zIndex: 20 });
  };

  // Default table matches the invoice/quotation line-item shape most users
  // reach for this to build, but every column/row/color is editable after
  // insertion — this is just a sensible starting point, not a fixed shape.
  const insertTableOntoCanvas = () => {
    const id = `custom_${crypto.randomUUID()}`;
    const maxContentY = Math.max(pageHeight, ...(canvasElements || []).map((el) => el.y + (el.h || 20)));
    const lastPageIndex = Math.max(0, Math.ceil(maxContentY / pageHeight) - 1);
    const columns = [
      { label: 'Description', width: 180, align: 'left' as const },
      { label: 'Qty', width: 60, align: 'center' as const },
      { label: 'Unit Price', width: 90, align: 'right' as const },
      { label: 'Amount', width: 90, align: 'right' as const },
    ];
    const rows = [
      ['Item description', '1', '0.00', '0.00'],
      ['Item description', '1', '0.00', '0.00'],
      ['Item description', '1', '0.00', '0.00'],
    ];
    const headerHeight = 32;
    const rowHeight = 28;
    addElement({
      id, type: 'table', x: 60, y: lastPageIndex * pageHeight + 300,
      w: columns.reduce((s, c) => s + c.width, 0), h: headerHeight + rows.length * rowHeight,
      columns, rows, headerHeight, rowHeight, fontSize: 11,
      headerBg: '#f1f5f9', headerColor: '#1a1c21', cellColor: '#1a1c21', borderColor: '#e2e8f0',
      section: 'custom', zIndex: 20,
    } as InvoiceElement);
    handleSelectElement(id);
  };

  const [assetModalMode, setAssetModalMode] = useState<'image' | 'signature' | null>(null);
  const handleAssetAdded = (dataUrl: string) => {
    const kind = assetModalMode === 'signature' ? 'signature' : 'image';
    addUploadedAsset({ id: `asset_${crypto.randomUUID()}`, dataUrl, kind });
    insertAssetOntoCanvas(dataUrl);
  };

  // PDF reuses the existing store-driven export (html2pdf.js in demo mode).
  // PNG/JPEG render the actual canvas DOM node straight to an image via
  // html2canvas — `quality` maps to its render scale (higher scale = a
  // larger, crisper raster image, at a proportionally bigger file size).
  const handleExport = async (format: 'pdf' | 'png' | 'jpeg' = 'pdf', options?: ExportOptions) => {
    const { isGuest, isAuthenticated } = useAuthStore.getState();
    if (!isAuthenticated || isGuest) {
      setShowGuestDownloadModal(true);
      return;
    }

    if(format!=='pdf') {
      await useChatStore.getState().fetchMissingFields();
      const verified=useChatStore.getState();
      if(!verified.canGenerate||verified.isLoading||verified.pendingTurn||verified.error) {
        useDocumentStore.setState({error:'Complete, review and confirm the document details before exporting.'});
        await verified.fetchSummary();
        return;
      }
    }

    if (format === 'pdf') {
      trackButtonClick('btn_download_pdf_click');
      try {
        await exportPdf();
      } catch (err) {
        if (err && typeof err === 'object' && 'code' in err && err.code === 'quota_exceeded') {
          setShowUpgradeModal(true);
        }
      }
      return;
    }

    const target = document.getElementById('invoice-canvas')?.closest('[class*="bg-white"]') as HTMLElement | null
      || document.getElementById('invoice-canvas');
    if (!target) return;
    const { default: html2canvas } = await import('html2canvas');
    const canvas = await withExportFontMetrics(() => html2canvas(target, {
      scale: options?.scale ?? 2,
      useCORS: true,
      backgroundColor: '#ffffff',
    }));
    const mime = format === 'png' ? 'image/png' : 'image/jpeg';
    const dataUrl = canvas.toDataURL(mime, format === 'jpeg' ? (options?.jpegQuality ?? 0.92) : undefined);
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `document.${format === 'jpeg' ? 'jpg' : 'png'}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // Helper to trigger toolkit expand. Re-clicking the already-active tab is a
  // no-op (stays open) — only the dedicated collapse controls (chevron / top
  // "Toolkit" button) close the drawer, so a stray re-click can't make the
  // panel (and whatever it was showing, e.g. the template grid) vanish.
  const openToolkitTab = (tab: ToolkitTab) => {
    setToolkitCollapsed(false);
    setActiveToolkitTab(tab);
  };

  // Show sleek loading spinner when session is initializing
  if (isStartingSession) {
    return (
      <div className="min-h-screen pt-14 bg-appBg flex flex-col items-center justify-center" id="builder-page-loading">
        <div className="flex flex-col items-center gap-4 text-center max-w-sm px-4">
          <div className="relative flex items-center justify-center">
            <div className="w-16 h-16 border-4 border-brand-500/20 border-t-brand-500 rounded-full animate-spin" />
            <div className="absolute inset-0 flex items-center justify-center font-bold text-xs text-brand-400">
              AI
            </div>
          </div>
          <div>
            <h3 className="text-body-md font-bold text-appTextPrimary mb-1">Building Your Workspace</h3>
            <p className="text-body-xs text-appTextSecondary">Initializing interactive assistant & preparing design templates...</p>
          </div>
        </div>
      </div>
    );
  }

  // Show document type selector if no session
  if (!sessionId) {
    return (
      <motion.div
        className="min-h-screen pt-14 bg-appBg flex flex-col justify-center"
        id="builder-page"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.4 }}
      >
        <div className="w-full">
          <DocumentTypeSelector
            onSelect={handleSelectDocType}
            error={chatError}
            onRetry={lastAttemptedType ? () => void handleSelectDocType(lastAttemptedType) : undefined}
          />
        </div>
      </motion.div>
    );
  }

  // CSS `transform: scale()` is purely visual — it doesn't shrink an
  // element's contribution to its scrollable ancestor's scrollHeight, so a
  // page rendered at native size and then scaled down still reserves the
  // FULL native height's worth of scroll space, letting the panel scroll
  // into blank area below content that's already entirely visible. Each
  // page render below uses an un-transformed OUTER box sized to the actual
  // visual (scaled) dimensions, with the transform + native size moved to
  // an INNER box — that makes the outer box's layout footprint match what's
  // actually on screen.
  const effectiveScale = fitScale * zoom / 100;

  return (
    <>
    {/* Below ~1100px, replace the 3-panel editor with a single-column
        chat-first view — see the mobileTab state declaration for why. */}
    <div className="hidden max-[1099px]:flex flex-col h-screen bg-appBg text-appTextPrimary pt-14" id="builder-page-mobile">
      <div className="flex items-center justify-between px-3 py-2 border-b border-appBorder flex-shrink-0">
        <button onClick={() => navigate('/dashboard')} className="p-1.5 text-appTextSecondary hover:text-appTextPrimary">
          <ArrowLeft size={18} />
        </button>
        <span className="text-sm font-bold text-appTextPrimary capitalize">
          {(documentType || 'invoice').replace('_', ' ')}
        </span>
        <button
          onClick={() => handleExport()}
          disabled={downloadBlocked || isExporting || (!previewHtml && !canvasElements)}
          className="p-1.5 text-appTextSecondary hover:text-appTextPrimary disabled:opacity-40"
          title={downloadBlocked ? 'Sign in or create an account to download' : 'Download PDF and confirm the current document details'}
        >
          <Download size={18} />
        </button>
      </div>

      {downloadBlocked && <button type="button" onClick={() => setShowGuestDownloadModal(true)} className="text-xs py-2 text-brand-500">Sign in or create an account to download</button>}
      {documentError && <p role="alert" className="px-3 py-2 text-xs text-red-500">{documentError}</p>}

      <div className="flex border-b border-appBorder flex-shrink-0">
        {(['chat', 'preview'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setMobileTab(tab)}
            className={`flex-1 py-2.5 text-xs font-semibold uppercase tracking-wide transition-colors ${
              mobileTab === tab ? 'text-brand-500 border-b-2 border-brand-500' : 'text-appTextSecondary'
            }`}
          >
            {tab === 'chat' ? 'Chat' : 'Preview'}
          </button>
        ))}
      </div>

      {mobileTab === 'chat' ? (
        <div className="flex-1 min-h-0">
          <ChatPanel />
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto flex flex-col items-center px-3 py-4 gap-3">
          <p className="text-[11px] text-appTextSecondary text-center max-w-xs">
            Read-only preview — switch to a larger screen to drag, resize, or restyle elements.
          </p>
          {canvasElements?.length ? (
            Array.from({length:Math.max(1,Math.ceil(Math.max(pageHeight,...canvasElements.map(el=>el.y+el.h))/pageHeight))},(_,pageIndex)=>(
              <div key={pageIndex} className="w-full max-w-[380px] bg-white shadow-lg overflow-hidden pointer-events-none" style={{aspectRatio:`${pageWidth} / ${pageHeight}`}}>
                <div style={{width:pageWidth,height:pageHeight,transform:`scale(${380/pageWidth})`,transformOrigin:'top left'}}>
                  <InvoiceCanvas elements={canvasElements} selectedElementId={null} selectedElementIds={[]} activeTool="select" zoom={100}
                    pageWidth={pageWidth} pageHeight={pageHeight} pageBackgroundColor={pageBackgroundColor} showGrid={false} pageIndex={pageIndex} pageOffsetY={pageIndex*pageHeight}
                    onSelect={()=>{}} onSelectMany={()=>{}} onSelectPage={()=>{}} onUpdate={()=>{}} onUpdateMany={()=>{}} onAddElement={()=>{}} onCheckpoint={()=>{}} selectedCell={null} onSelectCell={()=>{}}/>
                </div>
              </div>
            ))
          ) : previewHtml ? (
            <div
              className="w-full max-w-[380px] bg-white text-gray-800 shadow-lg overflow-hidden pointer-events-none"
              style={{ aspectRatio: `${pageWidth} / ${pageHeight}` }}
            >
              <iframe title="Document preview" sandbox="" srcDoc={previewHtml}
                style={{ width: pageWidth, height: pageHeight, transform: `scale(${380 / pageWidth})`, transformOrigin: 'top left' }} />
            </div>
          ) : (
            <p className="text-xs text-appTextSecondary py-8">Nothing generated yet — start chatting to build your document.</p>
          )}
        </div>
      )}
    </div>

    <motion.div
      className="hidden min-[1100px]:flex h-screen bg-appBg flex-col overflow-hidden text-appTextPrimary pt-14"
      id="builder-page"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
    >
      {/* Main Collapsible 4-Panel Canvas */}
      <div className="flex-1 flex overflow-hidden relative">

        {/* PANEL 1: AI Chat (30% width) — rounded-tr softens the inner
            corner where this panel meets the canvas area at the top. */}
        <div
          className={`h-full rounded-tr-[4px] border-r border-appBorder bg-appSurface/65 backdrop-blur-sm flex flex-col transition-all duration-300 relative ${
            chatCollapsed ? 'w-12 flex-shrink-0' : 'w-[30%] min-w-[320px] max-w-[420px]'
          }`}
        >
          {chatCollapsed ? (
            <div className="flex flex-col items-center py-4 gap-4 h-full">
              <button
                onClick={() => setChatCollapsed(false)}
                className="p-1.5 hover:bg-appSurface rounded border border-appBorder"
              >
                <ChevronRight size={14} />
              </button>
              <div className="h-px w-4 bg-appBorder" />
              <div className="flex-1 flex items-center justify-center">
                <span className="text-[10px] font-bold text-appTextSecondary uppercase tracking-widest vertical-text select-none">
                  AI Assistant
                </span>
              </div>
              <MessageSquare size={16} className="text-appPrimary/70" />
            </div>
          ) : (
            <div className="flex flex-col h-full overflow-hidden text-left">
              {/* Chat Area — "AI Assistant" label + collapse control now live
                  inside ChatPanel's own top row (alongside Review/Reset),
                  instead of a separate bordered/backgrounded header bar, so
                  the hero content below sits higher with less dead space. */}
              <div className="flex-1 overflow-hidden">
                <ChatPanel onCollapse={() => setChatCollapsed(true)} />
              </div>
            </div>
          )}
        </div>


        {/* PANEL 3: Document Preview (remaining width). The old top
            navigation bar (Builder · Invoice label, Toolkit, Download PDF)
            is gone — those controls now live in a Canva-style floating
            toolbar that overlaps the top of the canvas itself, matching
            Canva's own floating contextual toolbar (white pill, rounded,
            shadowed, icon groups separated by thin dividers) instead of a
            fixed bar with its own row height. */}
        {/* min-w-0 overrides flexbox's default min-width:auto — without it,
            this flex-1 panel refuses to shrink below its content's
            intrinsic width on narrow viewports, pushing the whole layout
            wider than the screen instead of just scrolling/fitting. */}
        <div className="flex-1 min-w-0 h-full bg-appSurface/30 flex flex-col relative w-full">
            {/* Minimal floating back control, top-left — kept separate from
                the main floating toolbar (Canva itself keeps its document
                title/home nav in its own global bar, distinct from the
                floating contextual one). */}
            <button
              onClick={handleBackToSelector}
              className="absolute top-3 left-3 z-30 p-2 bg-appSurface rounded-full shadow-lg border border-appBorder/40 text-appTextSecondary hover:text-appTextPrimary transition-colors"
              title="Back to Document Selection"
            >
              <ArrowLeft size={16} />
            </button>

            {/* Canva-style floating toolbar — white/appSurface pill, shadow,
                rounded-full, icon groups separated by thin vertical
                dividers, floating centered over the top of the canvas
                rather than occupying its own fixed-height bar. */}
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 bg-appSurface rounded-full shadow-lg border border-appBorder/40 pl-2 pr-1.5 py-1.5 max-w-[calc(100%-24px)]">
              {canvasElements && (
                <>
                  <div className="flex items-center gap-0.5">
                    {CANVAS_TOOLS.map(({ tool, icon, title }) => (
                      <button
                        key={tool}
                        title={title}
                        onClick={() => setActiveTool(tool)}
                        className={`p-1.5 rounded-full transition-colors ${
                          activeTool === tool ? 'bg-brand-500 text-white' : 'text-appTextSecondary hover:bg-appBg hover:text-appTextPrimary'
                        }`}
                      >
                        {icon}
                      </button>
                    ))}
                  </div>
                  <div className="w-px h-5 bg-appBorder flex-shrink-0" />
                  {/* Tables aren't drawn by dragging like the shape tools
                      above — they're a fixed default size, dropped in and
                      then resized/edited in place, same as pasting an
                      asset. */}
                  <button
                    title="Insert table"
                    onClick={insertTableOntoCanvas}
                    className="p-1.5 rounded-full text-appTextSecondary hover:bg-appBg hover:text-appTextPrimary transition-colors flex-shrink-0"
                  >
                    <TableIcon size={14} />
                  </button>
                  <div className="w-px h-5 bg-appBorder flex-shrink-0" />
                  {/* Discards manual drag/resize/restyle edits and added
                      shapes, restoring the template's original Figma layout. */}
                  <button
                    title="Reset to default layout"
                    onClick={() => resetElementLayout(collectedData || activeSampleData)}
                    className="p-1.5 rounded-full text-appTextSecondary hover:bg-appBg hover:text-appTextPrimary transition-colors flex-shrink-0"
                  >
                    <RotateCcw size={14} />
                  </button>
                  <div className="w-px h-5 bg-appBorder flex-shrink-0" />
                </>
              )}

              {/* Zoom controls — percentage is always relative to "fit"
                  (100% = fits the panel), and typable directly. */}
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  onClick={() => setZoom((z) => Math.max(25, z - 10))}
                  className="p-1 hover:bg-appBg rounded-full text-appTextSecondary hover:text-appTextPrimary text-[10px] font-bold w-6 h-6 flex items-center justify-center"
                >
                  -
                </button>
                <input
                  type="text"
                  inputMode="numeric"
                  value={zoomInputValue ?? `${zoom}%`}
                  onFocus={(e) => { setZoomInputValue(`${zoom}`); e.currentTarget.select(); }}
                  onChange={(e) => setZoomInputValue(e.target.value.replace(/[^0-9]/g, ''))}
                  onBlur={() => {
                    const n = Number(zoomInputValue);
                    if (zoomInputValue && !Number.isNaN(n)) setZoom(Math.max(25, Math.min(400, Math.round(n))));
                    setZoomInputValue(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') e.currentTarget.blur();
                    if (e.key === 'Escape') { setZoomInputValue(null); e.currentTarget.blur(); }
                  }}
                  className="text-[10px] font-mono text-appTextSecondary w-9 text-center select-none bg-transparent outline-none focus:text-appTextPrimary"
                  title="Zoom (type a value, Enter to apply)"
                />
                <button
                  onClick={() => setZoom((z) => Math.min(400, z + 10))}
                  className="p-1 hover:bg-appBg rounded-full text-appTextSecondary hover:text-appTextPrimary text-[10px] font-bold w-6 h-6 flex items-center justify-center"
                >
                  +
                </button>
              </div>
              <div className="w-px h-5 bg-appBorder flex-shrink-0" />
              {/* Grid on/off — previously only reachable by double-clicking
                  empty canvas space to open the page-properties panel,
                  which made it easy to miss entirely. Lives here next to
                  zoom now, alongside the other view toggles. */}
              <button
                onClick={() => setShowGrid(!showGrid)}
                title={showGrid ? 'Hide grid' : 'Show grid'}
                className={`p-1.5 rounded-full transition-colors flex-shrink-0 ${showGrid ? 'bg-brand-500 text-white' : 'text-appTextSecondary hover:bg-appBg hover:text-appTextPrimary'}`}
              >
                <LayoutGrid size={14} />
              </button>
              <div className="w-px h-5 bg-appBorder flex-shrink-0" />
              <button
                onClick={() => setToolkitCollapsed(!toolkitCollapsed)}
                title="Toggle Toolkit panel"
                className={`p-1.5 rounded-full transition-colors flex-shrink-0 ${!toolkitCollapsed ? 'bg-brand-500 text-white' : 'text-appTextSecondary hover:bg-appBg hover:text-appTextPrimary'}`}
              >
                <Sliders size={14} />
              </button>
              <div className="w-px h-5 bg-appBorder flex-shrink-0" />
              <button
                onClick={() => handleExport()}
                disabled={downloadBlocked || isExporting || (!previewHtml && (canvasElements?.length ?? 0) === 0)}
                title={downloadBlocked ? 'Sign in or create an account to download' : 'Download PDF and confirm the current document details'}
                className="flex items-center gap-1.5 pl-2.5 pr-3 py-1.5 rounded-full bg-appSuccess text-white text-xs font-semibold hover:bg-appSuccess/90 disabled:opacity-40 transition-colors flex-shrink-0"
              >
                {isExporting ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
                Download
              </button>
            </div>

            {downloadBlocked && <button type="button" onClick={() => setShowGuestDownloadModal(true)} className="absolute top-16 left-1/2 -translate-x-1/2 z-30 rounded bg-appSurface px-3 py-2 text-xs text-brand-500 shadow">Sign in or create an account to download</button>}
            {documentError && <p role="alert" className="absolute top-16 left-3 right-3 z-40 rounded border border-red-400 bg-appSurface px-3 py-2 text-xs text-red-500">{documentError}</p>}

            <div className="flex flex-col h-full overflow-hidden">
              {/* Live Preview Display */}
              {/* No justify-center here on purpose — centering an
                  overflow-auto flex container with justify-content clips
                  the START of any content taller than the container (a
                  well-known flexbox quirk: scrollTop=0 lands mid-content,
                  and the top becomes unreachable). Each page wrapper below
                  centers itself safely via my-auto margins instead, which
                  clamp to 0 (i.e. top-aligned) rather than clipping when
                  the content doesn't fit. Extra top padding here (vs. the
                  other sides) clears the floating toolbar overlapping this
                  panel's top edge, so contain-fit never centers page content
                  underneath it. */}
              <div ref={setPreviewAreaRef} className="flex-1 overflow-auto pt-14 p-4 md:pt-16 md:p-6 flex flex-col items-center bg-appBg/40">
                {isGenerating ? (
                  <div className="flex flex-col items-center justify-center gap-4 h-full">
                    <Loader2 size={32} className="text-appPrimary animate-spin" />
                    <p className="text-sm text-appTextSecondary">Generating live layout...</p>
                  </div>
                ) : selectedTemplate?.startsWith('upl_')&&!previewHtml ? (
                  <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center" role={documentError?'alert':'status'}>
                    {documentError?<><p className="text-sm text-appTextSecondary">{documentError}</p><button className="text-sm text-brand-500 underline" onClick={()=>refreshCanvasElements({documentType:documentType||'invoice',...activeData})}>Retry template preview</button></>:<><Loader2 size={28} className="animate-spin text-brand-500"/><p className="text-sm text-appTextSecondary">Loading your template preview…</p></>}
                  </div>
                ) : canvasElements ? (
                  // Editable Figma-style canvas — every text/shape is selectable,
                  // draggable and resizable by default, no opt-in required.
                  // Renders multiple A4 page cards when content exceeds 1 page.
                  (() => {
                    const maxContentY = Math.max(
                      pageHeight,
                      ...(canvasElements || []).map((el) => el.y + (el.h || 20))
                    );
                    const totalPages = Math.max(1, Math.ceil(maxContentY / pageHeight));
                    return (
                      <div id="invoice-canvas-container" className="flex flex-col items-center gap-8 my-auto py-4">
                        {totalPages > 1 && (
                          <div className="sticky top-2 z-30 mb-2 flex items-center gap-1.5 p-1.5 bg-appSurface/95 backdrop-blur border border-appBorder/80 rounded-full shadow-lg text-xs font-semibold text-appTextSecondary select-none">
                            <span className="px-2 text-[11px] font-bold text-appTextPrimary uppercase tracking-wider">Pages ({totalPages})</span>
                            {Array.from({ length: totalPages }, (_, pIdx) => (
                              <button
                                key={pIdx}
                                onClick={() => {
                                  document.getElementById(`canvas-page-card-${pIdx}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                }}
                                className="px-3 py-1 rounded-full hover:bg-brand-500/10 hover:text-brand-500 transition-colors flex items-center gap-1 bg-appBg/60 border border-appBorder/40"
                              >
                                <span className="w-1.5 h-1.5 rounded-full bg-brand-500" />
                                <span>Page {pIdx + 1}</span>
                              </button>
                            ))}
                          </div>
                        )}
                        {Array.from({ length: totalPages }, (_, pageIndex) => (
                          <div key={pageIndex} id={`canvas-page-card-${pageIndex}`} className="flex flex-col items-center">
                            {totalPages > 1 && (
                              <div className="mb-2 px-3 py-1 bg-appSurface/90 border border-appBorder/60 rounded-full text-[11px] font-semibold text-appTextSecondary shadow-sm flex items-center gap-1.5 select-none">
                                <span className="w-1.5 h-1.5 rounded-full bg-brand-500 animate-pulse" />
                                <span>Page {pageIndex + 1} of {totalPages}</span>
                              </div>
                            )}
                            <div
                              className="flex-shrink-0 transition-all duration-300 relative"
                              style={{ width: pageWidth * effectiveScale, height: pageHeight * effectiveScale }}
                            >
                              <div
                                style={{ width: pageWidth, height: pageHeight, transform: `scale(${effectiveScale})`, transformOrigin: 'top left' }}
                                className="shadow-2xl rounded-none overflow-hidden bg-white"
                              >
                                <InvoiceCanvas
                                  elements={canvasElements}
                                  selectedElementId={selectedElementId}
                                  selectedElementIds={selectedElementIds}
                                  activeTool={activeTool}
                                  zoom={fitScale * zoom}
                                  pageWidth={pageWidth}
                                  pageHeight={pageHeight}
                                  pageBackgroundColor={pageBackgroundColor}
                                  showGrid={showGrid}
                                  pageIndex={pageIndex}
                                  pageOffsetY={pageIndex * pageHeight}
                                  onSelect={handleSelectElement}
                                  onSelectMany={(ids) => { selectElements(ids); if (ids.length) { setToolkitCollapsed(false); setActiveToolkitTab('inspector'); } }}
                                  onSelectPage={handleSelectPage}
                                  onUpdate={updateElement}
                                  onUpdateMany={updateElements}
                                  onAddElement={addElement}
                                  onCheckpoint={checkpointHistory}
                                  onContextMenu={(e, _elementId, cell) => setContextMenu({ x: e.clientX, y: e.clientY, cell })}
                                  selectedCell={selectedCell}
                                  onSelectCell={setSelectedCell}
                                />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })()
                ) : previewHtml ? (
                  // This HTML preview's height is content-driven (not a
                  // fixed page height like the element-model canvas above),
                  // so it keeps the simpler transform-only approach.
                  <div
                    style={{ transform: `scale(${effectiveScale})`, transformOrigin: 'top center' }}
                    className="w-[595px] flex-shrink-0 my-auto bg-white text-gray-800 shadow-xl rounded-none overflow-hidden transition-all duration-300"
                  >
                    <iframe title="Document template preview" sandbox="" srcDoc={previewHtml} className="w-full min-h-[842px] bg-white"/>
                  </div>
                ) : (
                  // Sample Document Mock on first load (before data collected) —
                  // used for templates without an element-model migration yet.
                  // Same content-driven-height reasoning as previewHtml above.
                  <div
                    style={{ transform: `scale(${effectiveScale})`, transformOrigin: 'top center' }}
                    className="relative flex-shrink-0 my-auto transition-all duration-300"
                  >
                    <div
                      className="w-[595px] bg-white text-gray-800 shadow-xl rounded-none overflow-hidden text-left select-none"
                      dangerouslySetInnerHTML={{
                        __html: renderTemplate(
                          selectedTemplate || 'tmpl_invoice_2023_01',
                          activeSampleData,
                          layoutState || {
                            headerAlignment: 'left',
                            fontSize: 'medium',
                            showLogo: false,
                            showNotes: true,
                            showHeader: true,
                            showTotalDetails: true,
                            sectionOrder: ['header', 'client_details', 'line_items', 'total', 'notes'],
                          },
                          accentColor,
                          documentType || 'invoice'
                        )
                      }}
                    />
                  </div>
                )}
              </div>
            </div>
        </div>

        {/* PANEL 4: Toolkit Panel (Vertical strip + Expanded Drawer) —
            rounded-tl softens the inner corner where this panel meets the
            canvas area at the top. */}
        <div
          className={`h-full rounded-tl-[4px] border-l border-appBorder bg-appSurface flex flex-col transition-all duration-300 relative ${
            toolkitCollapsed ? 'w-12 flex-shrink-0' : 'w-[20%] min-w-[260px] max-w-[340px]'
          }`}
        >
          {/* Document type — sits above everything else in the toolkit (not
              tucked inside the Choose Template tab), so it's the very first
              thing you see regardless of which tab is active. Just the bare
              dropdown, no "Document type" caption above it. */}
          {!toolkitCollapsed && (
            <div className="px-2 py-2 border-b border-appBorder flex-shrink-0 relative">
              <select
                value={documentType || 'invoice'}
                onChange={(e) => handleSelectDocType(e.target.value as DocumentType)}
                className="w-full appearance-none bg-appSurface border border-appSurface rounded-[4px] pl-2 pr-7 py-1.5 text-sm tracking-wide text-appTextPrimary font-semibold outline-none focus:outline-none focus:ring-0 focus:border-appSurface"
              >
                {DOCUMENT_TYPES.map((d) => (
                  <option key={d.type} value={d.type}>{d.label}</option>
                ))}
              </select>
              <ChevronDown size={12} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-appTextSecondary" />
            </div>
          )}

          <div className="flex-1 flex overflow-hidden">
          {/* Vertical Icon Strip (Always visible) */}
          <div className="w-12 h-full bg-appSurface flex flex-col items-center py-4 border-r border-appBorder/30 justify-between">
            <div className="space-y-4 w-full flex flex-col items-center">
              {TOOLKIT_TABS.map(({ tab, title, icon }) => (
                <ToolkitTabButton
                  key={tab}
                  title={title}
                  icon={icon}
                  active={!toolkitCollapsed && activeToolkitTab === tab}
                  onClick={() => openToolkitTab(tab)}
                />
              ))}
            </div>

            <Settings size={16} className="text-appTextSecondary/60" />
          </div>

          {/* Drawer Panel Details (Visible when expanded) */}
          {!toolkitCollapsed && (
            <div className="flex-1 flex flex-col h-full overflow-hidden text-left bg-appSurface">
              <div className="flex items-center justify-between px-4 py-2 bg-appBg/50 border-b border-appBorder">
                <span className="text-xs font-extrabold uppercase text-appTextPrimary tracking-wider">
                  {TOOLKIT_TABS.find((t) => t.tab === activeToolkitTab)?.title}
                </span>
                <button
                  onClick={() => setToolkitCollapsed(true)}
                  className="p-1 hover:bg-appBg border border-appBorder rounded text-appTextSecondary hover:text-appTextPrimary"
                >
                  <ChevronRight size={14} />
                </button>
              </div>

              {/* Sub-controls rendered inside drawer based on active tab */}
              <div ref={toolkitScrollRef} className="flex-1 overflow-y-auto p-4 space-y-5">
                {activeToolkitTab === 'inspector' && (
                  pageSelected ? (
                    <div className="space-y-5">
                      <div>
                        <h5 className="text-xs font-bold text-appTextPrimary mb-2">Page</h5>
                        <span className="block text-[9px] font-semibold uppercase tracking-wide text-appTextSecondary mb-1">Background color</span>
                        <div className="flex items-center gap-2">
                          <input
                            type="color"
                            value={pageBackgroundColor}
                            onChange={(e) => setPageBackgroundColor(e.target.value)}
                            className="w-7 h-7 rounded border border-appBorder bg-transparent cursor-pointer flex-shrink-0"
                          />
                          <input
                            type="text"
                            value={pageBackgroundColor}
                            onChange={(e) => setPageBackgroundColor(e.target.value)}
                            className="flex-1 min-w-0 bg-appBg border border-appBorder rounded-[4px] px-2 py-1.5 text-xs text-appTextPrimary font-mono"
                          />
                        </div>
                      </div>

                      <label className="flex items-center justify-between gap-2 cursor-pointer">
                        <span className="flex items-center gap-1.5 text-xs font-semibold text-appTextPrimary">
                          <LayoutGrid size={13} className="text-appTextSecondary" /> Show grid
                        </span>
                        <input
                          type="checkbox"
                          checked={showGrid}
                          onChange={(e) => setShowGrid(e.target.checked)}
                          className="w-4 h-4 accent-brand-500 cursor-pointer"
                        />
                      </label>

                      <div>
                        <span className="block text-[9px] font-semibold uppercase tracking-wide text-appTextSecondary mb-2">Page size</span>
                        <div className="grid grid-cols-2 gap-2">
                          {PAGE_SIZE_PRESETS.map((preset) => {
                            const active = pageWidth === preset.w && pageHeight === preset.h;
                            return (
                              <button
                                key={preset.label}
                                onClick={() => setPageSize(preset.w, preset.h)}
                                className={`px-2 py-2 rounded-[4px] border text-xs font-semibold transition-colors ${
                                  active
                                    ? 'border-brand-500 text-brand-500 bg-brand-500/5'
                                    : 'border-appBorder text-appTextSecondary hover:text-appTextPrimary hover:border-brand-400/60'
                                }`}
                              >
                                {preset.label}
                                <span className="block text-[9px] font-normal opacity-70">{preset.w} × {preset.h}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  ) : selectedElementIds.length > 1 ? (
                    <MultiElementInspector
                      elements={selectedElements}
                      documentColors={documentColors}
                      onUpdateAll={(patch) => updateElements(selectedElementIds, patch)}
                      onUpdateOne={updateElement}
                      onCheckpoint={checkpointHistory}
                      onDelete={() => {
                        const deletable = selectedElementIds.filter((id) => id.startsWith('custom_'));
                        if (deletable.length) deleteElements(deletable);
                        handleSelectElement(null);
                      }}
                    />
                  ) : selectedElement ? (
                    <ElementInspector
                      element={selectedElement}
                      isCustom={isSelectedElementCustom}
                      pageWidth={pageWidth}
                      pageHeight={pageHeight}
                      documentColors={documentColors}
                      onUpdate={(patch) => updateElement(selectedElement.id, patch)}
                      onCheckpoint={checkpointHistory}
                      onDelete={() => { deleteElement(selectedElement.id); handleSelectElement(null); }}
                      selectedCell={selectedCell?.elId === selectedElement.id ? selectedCell : null}
                    />
                  ) : (
                    <p className="text-xs text-appTextSecondary text-center py-8">
                      Select any text or shape on the canvas to edit its position, size, fill and style here. Double-click empty space to edit the page itself.
                    </p>
                  )
                )}

                {activeToolkitTab === 'layers' && canvasElements && (
                  <LayersPanel
                    elements={canvasElements}
                    selectedElementIds={selectedElementIds}
                    onSelect={selectElement}
                    onUpdate={updateElement}
                    onDelete={(id) => { if (id.startsWith('custom_')) deleteElement(id); }}
                    onCheckpoint={checkpointHistory}
                    onReorder={handleLayersReorder}
                  />
                )}

                {activeToolkitTab === 'templates' && (
                  <div className="-mx-4">
                    <TemplateSelector />
                  </div>
                )}

                {activeToolkitTab === 'export' && (
                  <>{downloadBlocked && <p className="text-xs text-appTextSecondary mb-3">Sign in or create an account to download PDFs and images.</p>}<ExportPanel isExporting={isExporting} onExport={handleExport} disabled={downloadBlocked || (!previewHtml && !canvasElements)} /></>
                )}

                {activeToolkitTab === 'uploads' && (
                  <div className="space-y-4">
                    <button
                      onClick={() => setAssetModalMode('image')}
                      className="w-full flex flex-col items-center justify-center gap-1.5 py-6 rounded-[4px] border-2 border-dashed border-appBorder hover:border-brand-400/60 text-appTextSecondary hover:text-appTextPrimary transition-colors"
                    >
                      <UploadIcon size={18} />
                      <span className="text-xs font-medium">Upload images</span>
                    </button>

                    {uploadedAssets.some((a) => a.kind === 'image') && (
                      <div>
                        <span className="block text-[9px] font-semibold uppercase tracking-wide text-appTextSecondary mb-2">Your uploads</span>
                        <div className="grid grid-cols-3 gap-2">
                          {uploadedAssets.filter((a) => a.kind === 'image').map((a) => (
                            <div key={a.id} className="relative group">
                              <button
                                onClick={() => insertAssetOntoCanvas(a.dataUrl)}
                                title="Add to canvas"
                                className="w-full aspect-square rounded-[4px] border border-appBorder bg-white overflow-hidden flex items-center justify-center hover:border-brand-500 transition-colors"
                              >
                                <img src={a.dataUrl} alt="Uploaded" className="w-full h-full object-contain" />
                              </button>
                              <button
                                onClick={() => removeUploadedAsset(a.id)}
                                title="Remove"
                                className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-appError text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                <X size={11} />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {activeToolkitTab === 'signature' && (
                  <div className="space-y-4">
                    <button
                      onClick={() => setAssetModalMode('signature')}
                      className="w-full flex flex-col items-center justify-center gap-1.5 py-6 rounded-[4px] border-2 border-dashed border-appBorder hover:border-brand-400/60 text-appTextSecondary hover:text-appTextPrimary transition-colors"
                    >
                      <PenTool size={18} />
                      <span className="text-xs font-medium">Add signature</span>
                    </button>

                    {uploadedAssets.some((a) => a.kind === 'signature') && (
                      <div>
                        <span className="block text-[9px] font-semibold uppercase tracking-wide text-appTextSecondary mb-2">Your signatures</span>
                        <div className="grid grid-cols-3 gap-2">
                          {uploadedAssets.filter((a) => a.kind === 'signature').map((a) => (
                            <div key={a.id} className="relative group">
                              <button
                                onClick={() => insertAssetOntoCanvas(a.dataUrl)}
                                title="Add to canvas"
                                className="w-full aspect-square rounded-[4px] border border-appBorder bg-white overflow-hidden flex items-center justify-center hover:border-brand-500 transition-colors"
                              >
                                <img src={a.dataUrl} alt="Signature" className="w-full h-full object-contain" />
                              </button>
                              <button
                                onClick={() => removeUploadedAsset(a.id)}
                                title="Remove"
                                className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-appError text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                <X size={11} />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {activeToolkitTab === 'fonts' && (
                  <div className="space-y-4">
                    <h5 className="text-xs font-bold text-appTextPrimary">Document Fonts</h5>
                    <p className="text-[10px] text-appTextSecondary -mt-2">
                      Applies to every text element's font face across the whole document — bold, italic, size, color
                      and everything else about each one stays exactly as it is.
                    </p>
                    <FontFacePicker
                      label="Document font"
                      value={documentFontFamily}
                      onChange={applyDocumentFont}
                    />
                  </div>
                )}

              </div>
            </div>
          )}
          </div>
        </div>

      </div>

      {/* Upgrade & Guest Download Modals */}
      <UpgradeModal />
      <GuestDownloadModal />

      {/* Upload / signature popup — big, centered, not squeezed into the
          narrow toolkit panel. */}
      {assetModalMode && (
        <AssetModal
          mode={assetModalMode}
          onClose={() => setAssetModalMode(null)}
          onAdd={handleAssetAdded}
        />
      )}

      {/* Canva-style right-click menu on canvas elements */}
      {contextMenu && (
        <CanvasContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenuItems}
          onClose={() => setContextMenu(null)}
        />
      )}
    </motion.div>
    </>
  );
};

export default BuilderPage;
