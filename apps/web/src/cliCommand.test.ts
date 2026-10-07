import { describe, it, expect } from 'vitest';
import { toCliCommand, deriveFilename, shellQuote, baseName } from './cliCommand';

describe('toCliCommand', () => {
  it('omits defaults', () => {
    expect(toCliCommand({ preset: 'auto', colors: 'auto', denoise: 0.2, simplify: 0.5, mode: 'stacked', gradients: false }, 'logo.svg', 'svg'))
      .toBe('npx trace-vectorizer logo.png -o logo.svg');
  });
  it('emits only non-default flags', () => {
    expect(toCliCommand({ preset: 'logo', colors: 6, simplify: 0.4 }, 'logo.svg', 'svg'))
      .toBe('npx trace-vectorizer logo.png --preset logo --colors 6 --simplify 0.4 -o logo.svg');
  });
  it('quotes the palette and prefers it over colors', () => {
    const c = toCliCommand({ colors: 4, palette: ['#ff0000', '#00ff00'] }, 'a.svg', 'svg');
    expect(c).toContain(`--palette '#ff0000,#00ff00'`);
    expect(c).not.toContain('--colors');
  });
  it('handles mode, gradients, corner, speckle, precision', () => {
    const c = toCliCommand({ mode: 'cutout', gradients: true, cornerThreshold: 45, filterSpeckle: 8, denoise: 0.4 }, 'x.pdf', 'pdf', 3);
    expect(c).toBe('npx trace-vectorizer x.png --denoise 0.4 --mode cutout --gradients --corner 45 --speckle 8 --precision 3 -o x.pdf');
  });
  it('quotes awkward names', () => {
    expect(toCliCommand({}, "my it's.svg", 'svg')).toContain('-o my-it_s.svg');
  });
});

describe('filenames', () => {
  it('derives from the image name', () => {
    expect(deriveFilename('photo.final.JPG', 'svg')).toBe('photo.final.svg');
    expect(deriveFilename('dir/sub/logo.png', 'PDF')).toBe('logo.pdf');
    expect(deriveFilename('', 'svg')).toBe('trace.svg');
    expect(baseName('my logo.png')).toBe('my-logo');
  });
  it('quotes shell arguments', () => {
    expect(shellQuote('a b')).toBe(`'a b'`);
    expect(shellQuote("it's")).toBe(`'it'\\''s'`);
    expect(shellQuote('ok-1.svg')).toBe('ok-1.svg');
  });
});
