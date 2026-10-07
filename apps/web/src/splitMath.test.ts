import { describe, it, expect } from 'vitest';
import { splitFromPointer, splitFromKey, zoomAt, fitView, clamp } from './splitMath';

describe('splitMath', () => {
  it('maps pointer to clamped fraction', () => {
    expect(splitFromPointer(150, 100, 200)).toBe(0.25);
    expect(splitFromPointer(50, 100, 200)).toBe(0);
    expect(splitFromPointer(900, 100, 200)).toBe(1);
    expect(splitFromPointer(5, 0, 0)).toBe(0.5);
  });
  it('keyboard steps', () => {
    expect(splitFromKey(0.5, 'ArrowRight', false)).toBeCloseTo(0.52);
    expect(splitFromKey(0.5, 'ArrowLeft', true)).toBeCloseTo(0.4);
    expect(splitFromKey(0.99, 'ArrowRight', true)).toBe(1);
    expect(splitFromKey(0.5, 'Home', false)).toBe(0);
    expect(splitFromKey(0.5, 'End', false)).toBe(1);
    expect(splitFromKey(0.5, 'a', false)).toBe(0.5);
  });
  it('zoom keeps anchor fixed', () => {
    const v = zoomAt({ x: 10, y: 20, scale: 1 }, 2, 110, 120);
    expect(v.scale).toBe(2);
    expect((110 - v.x) / v.scale).toBeCloseTo((110 - 10) / 1);
    expect((120 - v.y) / v.scale).toBeCloseTo((120 - 20) / 1);
  });
  it('zoom clamps', () => {
    expect(zoomAt({ x: 0, y: 0, scale: 60 }, 10, 0, 0).scale).toBe(64);
    expect(clamp(5, 0, 1)).toBe(1);
  });
  it('fits and centers', () => {
    const v = fitView(500, 300, 200, 100, 0);
    expect(v.scale).toBe(2.5);
    expect(v.x).toBe(0);
    expect(v.y).toBe(25);
  });
});
