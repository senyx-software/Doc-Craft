/* ============================================
   Editable Invoice Canvas — element data model
   Each template that supports the Figma-style editor is expressed as a
   flat list of these instead of a rendered HTML string, so every piece of
   text/shape can be selected, dragged, resized and restyled independently.
   ============================================ */

export type ElementType = 'text' | 'rect' | 'ellipse' | 'line' | 'image' | 'table';

export type CanvasSection = 'header' | 'client' | 'meta' | 'items' | 'totals' | 'notes' | 'footer' | 'custom';

interface BaseElement {
  id: string;
  type: ElementType;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation?: number;
  zIndex: number;
  locked?: boolean;
  // Hidden elements are skipped entirely by InvoiceCanvas's render (not
  // just dimmed), so PDF/PNG/JPEG export — which clones the live canvas
  // DOM rather than re-deriving from this array — naturally excludes them
  // too, with no separate export-side filtering needed.
  hidden?: boolean;
  section: CanvasSection;
  opacity?: number;
  // Drop shadow — flat fields (not a nested object) so MultiElementInspector's
  // shallow per-field "mixed value" detection across a selection still works.
  shadowEnabled?: boolean;
  shadowColor?: string;
  shadowBlur?: number;
  shadowOffsetX?: number;
  shadowOffsetY?: number;
  // Mirror the element in place — combined with rotation via CSS transform.
  flipH?: boolean;
  flipV?: boolean;
  // Elements sharing the same groupId act as one unit: clicking any member
  // selects the whole group (see InvoiceCanvas's handlePointerDownOnElement),
  // so they drag/move together without needing to reselect each time.
  groupId?: string;
}

export interface TextElement extends BaseElement {
  semanticField?: string;
  type: 'text';
  text: string;
  fontSize: number;
  fontWeight: number;
  color: string;
  align: 'left' | 'center' | 'right';
  fontFamily?: string;
  lineHeight?: number;
  italic?: boolean;
  strikethrough?: boolean;
  underline?: boolean;
  // Optional box border around the text itself (not the glyph outline).
  stroke?: string;
  strokeWidth?: number;
}

export interface ShapeElement extends BaseElement {
  type: 'rect' | 'ellipse' | 'line';
  fill: string;
  stroke?: string;
  strokeWidth?: number;
  radius?: number;
  // Only meaningful for type: 'line'.
  lineStyle?: 'solid' | 'dashed' | 'dotted' | 'long-dash' | 'dash-dot';
}

export interface ImageElement extends BaseElement {
  type: 'image';
  src: string;
}

export interface TableColumn {
  label: string;
  width: number;
  align?: 'left' | 'center' | 'right';
}

// Per-cell text formatting override — keyed by `"h-<col>"` for header cells
// or `"<row>-<col>"` for body cells. Absent fields fall back to the
// table's own fontSize/headerColor/cellColor/align, so most cells (which
// never get individually formatted) carry zero extra data.
export interface TableCellFormat {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  align?: 'left' | 'center' | 'right';
  color?: string;
  fontSize?: number;
}

// A real, editable table — add/remove rows and columns, resize columns,
// import bulk rows from CSV. `h` on the base element is derived (not
// freely dragged) from headerHeight + rows.length * rowHeight, recomputed
// whenever row count changes; `w` still drives overall table width, which
// is distributed across columns proportionally to their current widths.
export interface TableElement extends BaseElement {
  type: 'table';
  columns: TableColumn[];
  rows: string[][];
  headerHeight: number;
  rowHeight: number;
  fontSize: number;
  headerBg: string;
  headerColor: string;
  cellColor: string;
  borderColor: string;
  // Alternating body-row background (Word/Canva "banded rows") — unset
  // means every row shares the same (transparent) background.
  rowStripeColor?: string;
  cellFormats?: Record<string, TableCellFormat>;
}

export type InvoiceElement = TextElement | ShapeElement | ImageElement | TableElement;

export const PAGE_WIDTH = 595;
export const PAGE_HEIGHT = 842;
