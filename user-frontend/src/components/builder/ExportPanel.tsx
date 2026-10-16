import React, { useState } from 'react';
import { Download, Loader2, Clock, ChevronDown } from 'lucide-react';
import { PAGE_WIDTH, PAGE_HEIGHT } from '../../types/canvasElement';

export type ExportFormat = 'pdf' | 'png' | 'jpeg';

export interface ExportOptions {
  scale: number;
  jpegQuality?: number;
}

interface ExportPanelProps {
  isExporting: boolean;
  onExport: (format: ExportFormat, options: ExportOptions) => Promise<void> | void;
  disabled?: boolean;
}

const FORMAT_LABELS: Record<ExportFormat, string> = { pdf: 'PDF', png: 'PNG', jpeg: 'JPEG' };

// Rough size estimate — there's no way to know the real compressed size
// without actually rendering, so this is a heuristic (bytes/pixel tuned
// for a mostly-white, text-and-lines document like an invoice) purely to
// give a live ballpark while dragging, the way Canva's own panel does.
function estimateSizeMB(format: ExportFormat, widthPx: number, heightPx: number, jpegQuality: number): number {
  const pixels = widthPx * heightPx;
  const bytesPerPixel = format === 'jpeg' ? 0.05 + jpegQuality * 0.25 : 0.35;
  return (pixels * bytesPerPixel) / (1024 * 1024);
}

// Single Export tab (folded into the existing Templates/Branding/Colors/
// Fonts/Element tab strip, not a separate top-level Toolkit/Download nav) —
// borrows the parts of Canva's own download panel that actually apply to a
// single fixed-size page: file type, a quality/size slider with a live
// estimate, and basic size-limit/compression toggles. Watermark removal is
// deliberately left as a visible-but-inert placeholder for now, not wired
// to real output yet.
const ExportPanel: React.FC<ExportPanelProps> = ({ isExporting, onExport, disabled }) => {
  // Defaults to PNG (not PDF) so the quality slider and the file-size
  // checkboxes are visible immediately on opening this tab, matching
  // Canva's own panel — they only apply to image formats, so they were
  // easy to miss entirely if PDF (silent, no such options) was the
  // starting selection.
  const [format, setFormat] = useState<ExportFormat>('png');
  // 0-100, matching Canva's own slider range/feel — mapped to a 1x-4x
  // html2canvas render scale under the hood.
  const [qualityPct, setQualityPct] = useState(30);
  const [compress, setCompress] = useState(false);
  const [limitFileSize, setLimitFileSize] = useState(false);
  const [watermark, setWatermark] = useState(false);
  const [recent, setRecent] = useState<{ format: ExportFormat; time: string }[]>([]);

  const scale = 1 + (qualityPct / 100) * 3;
  const jpegQuality = compress ? 0.55 : 0.92;
  const widthPx = Math.round(PAGE_WIDTH * scale);
  const heightPx = Math.round(PAGE_HEIGHT * scale);
  let estimatedMB = estimateSizeMB(format, widthPx, heightPx, jpegQuality);
  // "Limit file size" caps the estimate (and the actual render scale) at a
  // fixed ceiling rather than exposing a byte-count input — simple, but a
  // real behavior, not just a decorative checkbox.
  const SIZE_LIMIT_MB = 2;
  let effectiveScale = scale;
  if (limitFileSize && estimatedMB > SIZE_LIMIT_MB) {
    const ratio = Math.sqrt(SIZE_LIMIT_MB / estimatedMB);
    effectiveScale = Math.max(1, scale * ratio);
    estimatedMB = SIZE_LIMIT_MB;
  }

  const handleExportClick = async () => {
    await onExport(format, {
      scale: effectiveScale,
      jpegQuality,
    });
    setRecent((r) => [{ format, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }, ...r].slice(0, 5));
  };

  return (
    <div className="space-y-5">
      <div>
        <span className="block text-[9px] font-semibold uppercase tracking-wide text-appTextSecondary mb-1.5">File type</span>
        <div className="relative">
          <select
            value={format}
            onChange={(e) => setFormat(e.target.value as ExportFormat)}
            className="w-full appearance-none bg-appBg border border-appBorder rounded-[4px] pl-2 pr-7 py-1.5 text-xs text-appTextPrimary font-medium outline-none focus:outline-none focus:ring-0 focus:border-appBorder"
          >
            {(['pdf', 'png', 'jpeg'] as ExportFormat[]).map((f) => (
              <option key={f} value={f}>{FORMAT_LABELS[f]}{f === 'png' ? ' (Suggested)' : ''}</option>
            ))}
          </select>
          <ChevronDown size={12} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-appTextSecondary" />
        </div>
      </div>

      {format !== 'pdf' && (
        <>
          <div>
            <span className="block text-[9px] font-semibold uppercase tracking-wide text-appTextSecondary mb-1.5">Quality</span>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={qualityPct}
                onChange={(e) => setQualityPct(Number(e.target.value))}
                style={{ accentColor: 'rgb(var(--accent-violet-500))' }}
                className="flex-1"
              />
              <span className="w-11 flex-shrink-0 text-center text-xs font-semibold text-appTextPrimary bg-appBg border border-appBorder rounded-[4px] py-1">
                {qualityPct}%
              </span>
            </div>
            <p className="text-[10px] text-appTextSecondary mt-1.5">
              {widthPx} × {heightPx} px · ~{estimatedMB < 0.1 ? '<0.1' : estimatedMB.toFixed(1)} MB
            </p>
          </div>

          <div className="space-y-2">
            <label className="flex items-center justify-between text-[11px] text-appTextSecondary">
              <span>Compress file (lower quality)</span>
              <input type="checkbox" checked={compress} onChange={(e) => setCompress(e.target.checked)} />
            </label>
            <label className="flex items-center justify-between text-[11px] text-appTextSecondary">
              <span>Limit file size (~{SIZE_LIMIT_MB}MB)</span>
              <input type="checkbox" checked={limitFileSize} onChange={(e) => setLimitFileSize(e.target.checked)} />
            </label>
            {/* Not wired to real output yet — visible so the control exists
                where users expect it, but intentionally inert for now. */}
            <label className="flex items-center justify-between text-[11px] text-appTextSecondary/50 cursor-not-allowed" title="Coming soon">
              <span>Remove watermark (coming soon)</span>
              <input type="checkbox" checked={watermark} onChange={(e) => setWatermark(e.target.checked)} disabled />
            </label>
          </div>
        </>
      )}

      <button
        onClick={handleExportClick}
        disabled={isExporting || disabled}
        className="w-full flex items-center justify-center gap-1.5 py-2 rounded-[4px] bg-appSuccess text-white text-xs font-semibold hover:bg-appSuccess/90 disabled:opacity-50 transition-colors"
      >
        {isExporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
        {isExporting ? 'Exporting…' : `Export ${FORMAT_LABELS[format]}`}
      </button>

      {recent.length > 0 && (
        <div className="pt-3 border-t border-appBorder">
          <span className="block text-[9px] font-semibold uppercase tracking-wide text-appTextSecondary mb-2">Recent exports</span>
          <ul className="space-y-1.5">
            {recent.map((r, i) => (
              <li key={i} className="flex items-center gap-2 text-[11px] text-appTextSecondary">
                <Clock size={11} className="flex-shrink-0" />
                <span className="font-semibold text-appTextPrimary uppercase">{r.format}</span>
                <span>exported at {r.time}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default ExportPanel;
