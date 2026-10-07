import { useEffect } from 'preact/hooks';
import { image, error, setImage } from './store';
import { startTracing } from './tracer';
import { onPaste, loadFile } from './loader';
import { Dropzone } from './components/Dropzone';
import { SplitView } from './components/SplitView';
import { Controls } from './components/Controls';

const NAV = [
  { href: '/png-to-svg', label: 'PNG to SVG' },
  { href: '/jpg-to-svg', label: 'JPG to SVG' },
  { href: '/free-logo-vectorizer', label: 'Logo vectorizer' },
  { href: '/image-to-svg-converter', label: 'Image to SVG' },
  { href: '/vectorizer-ai-alternative', label: 'Vectorizer.ai alternative' },
];

export function App() {
  useEffect(() => {
    const stop = startTracing();
    window.addEventListener('paste', onPaste);
    const prevent = (e: DragEvent) => e.preventDefault();
    const drop = (e: DragEvent) => {
      e.preventDefault();
      const f = e.dataTransfer?.files[0];
      if (f) void loadFile(f);
    };
    window.addEventListener('dragover', prevent);
    window.addEventListener('drop', drop);
    return () => {
      stop();
      window.removeEventListener('paste', onPaste);
      window.removeEventListener('dragover', prevent);
      window.removeEventListener('drop', drop);
    };
  }, []);

  const img = image.value;

  return (
    <div class="shell">
      <header class="topbar">
        <a class="brand" href="/">Trace<span>.</span></a>
        <nav aria-label="Guides">
          {NAV.map((n) => <a key={n.href} href={n.href}>{n.label}</a>)}
        </nav>
        {img && <button type="button" class="btn small" onClick={() => setImage(null)}>New image</button>}
      </header>
      {error.value && (
        <div class="error" role="alert">
          {error.value}
          <button type="button" class="btn small" onClick={() => { error.value = null; }}>Dismiss</button>
        </div>
      )}
      <main class={img ? 'workspace' : 'empty'}>
        {img ? (
          <>
            <SplitView />
            <aside class="sidebar">
              <p class="filename" title={img.name}>{img.name} · {img.width}×{img.height}</p>
              <Controls />
            </aside>
          </>
        ) : (
          <Dropzone />
        )}
      </main>
      <footer class="foot">Private by design: images are processed locally and never uploaded.</footer>
    </div>
  );
}
