import { useRef, useState } from 'preact/hooks';
import { loadFile, loadSample } from '../loader';

export function Dropzone() {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation(); // the window-level drop handler must not load it again
    setOver(false);
    const f = e.dataTransfer?.files[0];
    if (f) void loadFile(f);
  };

  return (
    <div
      class={`dropzone${over ? ' over' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
    >
      <div class="dz-icon" aria-hidden="true">◩</div>
      <h2>Drop an image to vectorize</h2>
      <p>PNG, JPG, WebP, GIF or BMP. Paste with Ctrl/Cmd+V. Everything runs in your browser; nothing is uploaded.</p>
      <div class="dz-actions">
        <button type="button" class="btn primary" onClick={() => input.current?.click()}>Choose file</button>
        <button type="button" class="btn" onClick={() => void loadSample()}>Try a sample logo</button>
      </div>
      <input
        ref={input}
        type="file"
        accept="image/*"
        hidden
        aria-label="Choose an image file"
        onChange={(e) => {
          const f = (e.currentTarget as HTMLInputElement).files?.[0];
          if (f) void loadFile(f);
          (e.currentTarget as HTMLInputElement).value = '';
        }}
      />
    </div>
  );
}
