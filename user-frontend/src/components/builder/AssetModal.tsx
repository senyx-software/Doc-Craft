import React, { useRef, useState } from 'react';
import ReactCrop, { centerCrop, type PercentCrop, type PixelCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { Upload, X, Wand2, PenTool, ImagePlus } from 'lucide-react';
import { removeBackground } from '../../utils/removeBackground';
import SignaturePad from './SignaturePad';

interface AssetModalProps {
  mode: 'image' | 'signature';
  onClose: () => void;
  onAdd: (dataUrl: string) => void;
}

// The crop step used to be squeezed into the ~300px toolkit panel — moved
// here into a real popup with room to actually work, plus a "Remove
// background" step (see utils/removeBackground.ts for why this is a plain
// canvas flood-fill rather than an AI model). Signature mode adds an
// Upload/Draw switch on top of the same crop flow; Draw skips straight to
// the signature pad since a freehand drawing is already exactly what's
// wanted, no cropping needed.
const AssetModal: React.FC<AssetModalProps> = ({ mode, onClose, onAdd }) => {
  const [subMode, setSubMode] = useState<'upload' | 'draw'>('upload');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [pendingSrc, setPendingSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState<PercentCrop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  const [isDragOver, setIsDragOver] = useState(false);
  const [bgRemoved, setBgRemoved] = useState(false);
  const [removingBg, setRemovingBg] = useState(false);

  const loadFile = (file: File | undefined) => {
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => {
      setPendingSrc(reader.result as string);
      setCrop(undefined);
      setCompletedCrop(undefined);
      setBgRemoved(false);
    };
    reader.readAsDataURL(file);
  };

  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    // Only set an initial centered crop once — re-loading the image after
    // "Remove background" swaps pendingSrc and re-fires onLoad, and we
    // don't want that to silently discard whatever crop the user already
    // dragged into place.
    if (crop) return;
    const { width, height } = e.currentTarget;
    setCrop(centerCrop({ unit: '%', width: 90, height: 90 }, width, height));
  };

  const handleRemoveBackground = () => {
    if (!imgRef.current) return;
    setRemovingBg(true);
    // Deferred a tick so the "Removing…" label actually paints before the
    // synchronous pixel-scan work (can take a moment on a big image) blocks
    // the main thread.
    setTimeout(() => {
      const img = imgRef.current;
      if (!img) { setRemovingBg(false); return; }
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) { setRemovingBg(false); return; }
      ctx.drawImage(img, 0, 0);
      removeBackground(canvas);
      setPendingSrc(canvas.toDataURL('image/png'));
      setBgRemoved(true);
      setRemovingBg(false);
    }, 30);
  };

  const handleAdd = () => {
    if (!imgRef.current || !completedCrop || !completedCrop.width || !completedCrop.height) return;
    const image = imgRef.current;
    const scaleX = image.naturalWidth / image.width;
    const scaleY = image.naturalHeight / image.height;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(completedCrop.width * scaleX));
    canvas.height = Math.max(1, Math.round(completedCrop.height * scaleY));
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(
      image,
      completedCrop.x * scaleX, completedCrop.y * scaleY, completedCrop.width * scaleX, completedCrop.height * scaleY,
      0, 0, canvas.width, canvas.height
    );
    onAdd(canvas.toDataURL('image/png'));
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/50" onClick={onClose}>
      <div
        className="bg-appSurface rounded-lg shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-appBorder">
          <h3 className="text-sm font-bold text-appTextPrimary">{mode === 'signature' ? 'Add signature' : 'Upload image'}</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-appBg text-appTextSecondary hover:text-appTextPrimary">
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {mode === 'signature' && (
            <div className="flex items-center gap-1 border border-appBorder rounded-full p-1 w-fit">
              <button
                onClick={() => setSubMode('upload')}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-colors ${subMode === 'upload' ? 'bg-brand-500 text-white' : 'text-appTextSecondary hover:text-appTextPrimary'}`}
              >
                <ImagePlus size={13} /> Upload
              </button>
              <button
                onClick={() => setSubMode('draw')}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-colors ${subMode === 'draw' ? 'bg-brand-500 text-white' : 'text-appTextSecondary hover:text-appTextPrimary'}`}
              >
                <PenTool size={13} /> Draw
              </button>
            </div>
          )}

          {mode === 'signature' && subMode === 'draw' ? (
            <SignaturePad onAdd={(dataUrl) => { onAdd(dataUrl); onClose(); }} />
          ) : !pendingSrc ? (
            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setIsDragOver(false); loadFile(e.dataTransfer.files?.[0]); }}
              onClick={() => fileInputRef.current?.click()}
              role="button"
              tabIndex={0}
              className={`cursor-pointer flex flex-col items-center justify-center gap-2 py-16 rounded-lg border-2 border-dashed transition-colors ${
                isDragOver ? 'border-brand-500 bg-brand-500/5' : 'border-appBorder hover:border-brand-400/60'
              }`}
            >
              <Upload size={28} className="text-appTextSecondary" />
              <p className="text-sm text-appTextSecondary">
                <span className="text-brand-500 font-semibold">Choose a file</span> or drag it here
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => { loadFile(e.target.files?.[0]); e.target.value = ''; }}
              />
            </div>
          ) : (
            <div className="space-y-3">
              <div className="bg-appBg border border-appBorder rounded-lg p-3 flex justify-center">
                <ReactCrop crop={crop} onChange={(_, pc) => setCrop(pc)} onComplete={(c) => setCompletedCrop(c)}>
                  {/* Canvas signature artwork is inserted through the document asset flow. */}
                  <img ref={imgRef} src={pendingSrc} onLoad={handleImageLoad} style={{ maxHeight: 420, display: 'block' }} />
                </ReactCrop>
              </div>
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-appTextSecondary flex-1">Drag the corners/edges to adjust the crop area.</p>
                <button
                  onClick={handleRemoveBackground}
                  disabled={removingBg}
                  className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-appBorder text-xs font-semibold text-appTextPrimary hover:border-brand-500 hover:text-brand-500 disabled:opacity-50 transition-colors"
                  title="Removes a plain/uniform background (e.g. white paper) — not full AI subject segmentation"
                >
                  <Wand2 size={13} />
                  {removingBg ? 'Removing…' : bgRemoved ? 'Background removed' : 'Remove background'}
                </button>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => { setPendingSrc(null); setCrop(undefined); setBgRemoved(false); }}
                  className="flex-1 py-2 text-sm font-semibold rounded-[4px] border border-appBorder text-appTextSecondary hover:text-appTextPrimary hover:bg-appBg transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={handleAdd}
                  disabled={!completedCrop?.width}
                  className="flex-1 py-2 text-sm font-semibold rounded-[4px] bg-brand-500 text-white hover:bg-brand-600 disabled:opacity-50 transition-colors"
                >
                  Add
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AssetModal;
