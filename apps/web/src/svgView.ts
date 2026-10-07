import { computed } from '@preact/signals';
import { toSvg } from 'trace-vectorizer';
import { result, hidden, overrides } from './store';

/** Current SVG markup, honoring hidden shapes and color overrides. */
export const svgMarkup = computed<string>(() => {
  const r = result.value;
  if (!r) return '';
  return toSvg(r, { hidden: [...hidden.value], overrides: overrides.value, precision: 2 });
});

export const svgBytes = computed<number>(() => new TextEncoder().encode(svgMarkup.value).length);
