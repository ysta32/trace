import { setImage, error } from './store';

let loadGen = 0;

export async function loadBlob(blob: Blob, name: string): Promise<void> {
  const gen = ++loadGen;
  let url: string | null = null;
  try {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const objectUrl = URL.createObjectURL(blob);
    url = objectUrl;
    const dims = await new Promise<{ w: number; h: number }>((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve({ w: im.naturalWidth, h: im.naturalHeight });
      im.onerror = () => reject(new Error('Could not decode this image'));
      im.src = objectUrl;
    });
    if (gen !== loadGen) {
      URL.revokeObjectURL(objectUrl); // superseded by a newer load
      return;
    }
    setImage({ name, bytes, url: objectUrl, width: dims.w, height: dims.h });
  } catch (e) {
    if (url) URL.revokeObjectURL(url);
    if (gen === loadGen) error.value = e instanceof Error ? e.message : String(e);
  }
}

export async function loadFile(file: File): Promise<void> {
  if (!file.type.startsWith('image/')) {
    error.value = 'That file is not an image';
    return;
  }
  await loadBlob(file, file.name);
}

/** Draws a sample logo at runtime so no binary asset is shipped. */
export async function loadSample(): Promise<void> {
  const c = document.createElement('canvas');
  c.width = 480; c.height = 480;
  const g = c.getContext('2d');
  if (!g) { error.value = 'Canvas is unavailable'; return; }
  g.fillStyle = '#fff7ea';
  g.fillRect(0, 0, 480, 480);
  g.fillStyle = '#1f3a93';
  g.beginPath(); g.arc(240, 240, 190, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#f5b82e';
  g.beginPath(); g.arc(240, 240, 140, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#e4572e';
  g.beginPath(); g.moveTo(240, 120); g.lineTo(350, 330); g.lineTo(130, 330); g.closePath(); g.fill();
  g.fillStyle = '#fff7ea';
  g.beginPath(); g.arc(240, 270, 36, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#1f3a93'; g.lineWidth = 14; g.lineCap = 'round';
  g.beginPath(); g.moveTo(170, 380); g.quadraticCurveTo(240, 340, 310, 380); g.stroke();
  const blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/png'));
  if (!blob) { error.value = 'Could not create sample'; return; }
  await loadBlob(blob, 'sample-logo.png');
}

export function onPaste(e: ClipboardEvent): void {
  const items = e.clipboardData?.files;
  const f = items && Array.from(items).find((x) => x.type.startsWith('image/'));
  if (f) {
    e.preventDefault();
    void loadFile(f);
  }
}
