import React, { useEffect, useRef, useState } from 'react';
import { Undo2, Redo2, Trash2 } from 'lucide-react';

interface Stroke {
  points: { x: number; y: number }[];
  color: string;
  width: number;
}

interface SignaturePadProps {
  // Called with a transparent-background PNG data URL of whatever's been
  // drawn — the canvas is never filled, so untouched pixels stay
  // transparent, matching how a real signature stamp should composite.
  onAdd: (dataUrl: string) => void;
}

const PEN_COLORS = ['#1a1c21', '#1d4ed8', '#b91c1c', '#15803d'];

// Freehand drawing pad for signing directly in the app — undo/redo replay
// the recorded stroke list onto a cleared canvas rather than snapshotting
// pixels, which keeps undo cheap and exact regardless of canvas size.
const SignaturePad: React.FC<SignaturePadProps> = ({ onAdd }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [redoStack, setRedoStack] = useState<Stroke[]>([]);
  const [color, setColor] = useState(PEN_COLORS[0]);
  const [thickness, setThickness] = useState(3);
  const drawingRef = useRef<Stroke | null>(null);

  const redraw = (allStrokes: Stroke[]) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const stroke of allStrokes) {
      if (!stroke || stroke.points.length < 2) continue;
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.width;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
      for (const p of stroke.points.slice(1)) ctx.lineTo(p.x, p.y);
      ctx.stroke();
    }
  };

  useEffect(() => { redraw(strokes); }, [strokes]);

  const getPos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drawingRef.current = { points: [getPos(e)], color, width: thickness };
    setRedoStack([]);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current || !(e.buttons & 1)) return;
    drawingRef.current.points.push(getPos(e));
    redraw([...strokes, drawingRef.current]);
  };

  const handlePointerUp = () => {
    // Capture into a local const before nulling the ref — setStrokes's
    // functional updater callback isn't guaranteed to run before the next
    // line executes, and if it runs after, `drawingRef.current` would
    // already be null by then, pushing a null stroke into the array and
    // crashing the whole app on the next redraw().
    const finished = drawingRef.current;
    drawingRef.current = null;
    if (!finished) return;
    if (finished.points.length > 1) {
      setStrokes((s) => [...s, finished]);
    }
  };

  const handleUndo = () => {
    if (strokes.length === 0) return;
    const last = strokes[strokes.length - 1];
    setStrokes((s) => s.slice(0, -1));
    setRedoStack((r) => [...r, last]);
  };

  const handleRedo = () => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    setRedoStack((r) => r.slice(0, -1));
    setStrokes((s) => [...s, next]);
  };

  const handleClear = () => {
    setStrokes([]);
    setRedoStack([]);
  };

  const handleAddClick = () => {
    const canvas = canvasRef.current;
    if (!canvas || strokes.length === 0) return;
    onAdd(canvas.toDataURL('image/png'));
    handleClear();
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          {PEN_COLORS.map((c) => (
            <button
              key={c}
              onClick={() => setColor(c)}
              title={c}
              className={`w-6 h-6 rounded-full border-2 ${color === c ? 'border-brand-500' : 'border-transparent'}`}
              style={{ backgroundColor: c }}
            />
          ))}
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="w-6 h-6 rounded-full border border-appBorder bg-transparent cursor-pointer"
            title="Custom color"
          />
        </div>
        <div className="flex items-center gap-1">
          <button onClick={handleUndo} disabled={!strokes.length} title="Undo" className="p-1.5 rounded border border-appBorder text-appTextSecondary hover:text-appTextPrimary disabled:opacity-30">
            <Undo2 size={14} />
          </button>
          <button onClick={handleRedo} disabled={!redoStack.length} title="Redo" className="p-1.5 rounded border border-appBorder text-appTextSecondary hover:text-appTextPrimary disabled:opacity-30">
            <Redo2 size={14} />
          </button>
          <button onClick={handleClear} disabled={!strokes.length} title="Clear" className="p-1.5 rounded border border-appBorder text-appTextSecondary hover:text-appError disabled:opacity-30">
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      <label className="flex items-center gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-appTextSecondary flex-shrink-0">Pen thickness</span>
        <input
          type="range"
          min={1}
          max={10}
          value={thickness}
          onChange={(e) => setThickness(Number(e.target.value))}
          style={{ accentColor: color }}
          className="flex-1"
        />
        <span className="w-6 text-center text-[10px] text-appTextSecondary flex-shrink-0">{thickness}</span>
      </label>

      <canvas
        ref={canvasRef}
        width={640}
        height={260}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        className="w-full rounded-[4px] border border-appBorder bg-white touch-none cursor-crosshair"
        style={{
          backgroundImage: 'linear-gradient(45deg, #f0f0f0 25%, transparent 25%), linear-gradient(-45deg, #f0f0f0 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #f0f0f0 75%), linear-gradient(-45deg, transparent 75%, #f0f0f0 75%)',
          backgroundSize: '16px 16px',
          backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0px',
        }}
      />
      <p className="text-[10px] text-appTextSecondary">Sign above — the background stays transparent when added.</p>

      <button
        onClick={handleAddClick}
        disabled={strokes.length === 0}
        className="w-full py-2 rounded-[4px] bg-appSuccess text-white text-xs font-semibold hover:bg-appSuccess/90 disabled:opacity-50 transition-colors"
      >
        Add signature
      </button>
    </div>
  );
};

export default SignaturePad;
