// Dependency-free "remove background" for logos/signatures on a plain
// background — not full AI segmentation (the well-known options for that,
// like @imgly/background-removal, are AGPL/commercial-licensed, not safe to
// embed in a closed-source product without paying for a license). This
// instead samples the background color from the image's corners, then
// flood-fills transparency in from the edges wherever the color matches —
// exactly the case that matters here (a photographed signature or logo on
// white/plain paper), without any external model or license risk.
export function removeBackground(canvas: HTMLCanvasElement, tolerance = 32): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const { width, height } = canvas;
  if (!width || !height) return;
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;

  const cornerIdx = [
    0,
    (width - 1) * 4,
    (height - 1) * width * 4,
    ((height - 1) * width + (width - 1)) * 4,
  ];
  let r = 0, g = 0, b = 0;
  for (const idx of cornerIdx) { r += data[idx]; g += data[idx + 1]; b += data[idx + 2]; }
  r /= 4; g /= 4; b /= 4;

  const visited = new Uint8Array(width * height);
  const stack: number[] = [];
  const matchesBg = (idx4: number) => {
    const dr = data[idx4] - r;
    const dg = data[idx4 + 1] - g;
    const db = data[idx4 + 2] - b;
    return Math.sqrt(dr * dr + dg * dg + db * db) <= tolerance;
  };
  const pushIfBg = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const p = y * width + x;
    if (visited[p]) return;
    if (!matchesBg(p * 4)) return;
    visited[p] = 1;
    stack.push(p);
  };

  for (let x = 0; x < width; x++) { pushIfBg(x, 0); pushIfBg(x, height - 1); }
  for (let y = 0; y < height; y++) { pushIfBg(0, y); pushIfBg(width - 1, y); }

  while (stack.length) {
    const p = stack.pop() as number;
    const x = p % width;
    const y = (p / width) | 0;
    data[p * 4 + 3] = 0;
    pushIfBg(x + 1, y);
    pushIfBg(x - 1, y);
    pushIfBg(x, y + 1);
    pushIfBg(x, y - 1);
  }

  ctx.putImageData(imageData, 0, 0);
}
