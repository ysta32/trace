import { describe, it, expect } from 'vitest';
import { rectFromPoints, rectsIntersect, transformRect, hitTestMarquee, type Matrix } from './components/ShapePicking';

const I: Matrix = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

describe('marquee math', () => {
  it('normalizes drag direction', () => {
    expect(rectFromPoints(30, 40, 10, 5)).toEqual({ x: 10, y: 5, w: 20, h: 35 });
  });

  it('intersects inclusively, rejects disjoint', () => {
    expect(rectsIntersect({ x: 0, y: 0, w: 10, h: 10 }, { x: 10, y: 10, w: 5, h: 5 })).toBe(true);
    expect(rectsIntersect({ x: 0, y: 0, w: 10, h: 10 }, { x: 10.5, y: 0, w: 5, h: 5 })).toBe(false);
    expect(rectsIntersect({ x: 5, y: 5, w: 0, h: 0 }, { x: 0, y: 0, w: 10, h: 10 })).toBe(true);
  });

  it('maps user-space bboxes through pan/zoom (getScreenCTM)', () => {
    const zoom: Matrix = { a: 2, b: 0, c: 0, d: 2, e: 100, f: 50 };
    expect(transformRect({ x: 10, y: 10, w: 5, h: 5 }, zoom)).toEqual({ x: 120, y: 70, w: 10, h: 10 });
    const rot90: Matrix = { a: 0, b: 1, c: -1, d: 0, e: 0, f: 0 };
    expect(transformRect({ x: 0, y: 0, w: 10, h: 4 }, rot90)).toEqual({ x: -4, y: 0, w: 4, h: 10 });
  });

  it('hit-tests shapes in screen space', () => {
    const zoom: Matrix = { a: 2, b: 0, c: 0, d: 2, e: 100, f: 50 };
    const items = [
      { id: 1, bbox: { x: 0, y: 0, w: 10, h: 10 }, ctm: zoom },   // screen 100..120, 50..70
      { id: 2, bbox: { x: 50, y: 50, w: 10, h: 10 }, ctm: zoom }, // screen 200..220, 150..170
      { id: 3, bbox: { x: 0, y: 0, w: 10, h: 10 }, ctm: I },      // screen 0..10
    ];
    expect(hitTestMarquee(rectFromPoints(115, 65, 90, 40), items)).toEqual([1]);
    expect(hitTestMarquee(rectFromPoints(105, 55, 205, 155), items)).toEqual([1, 2]);
    expect(hitTestMarquee(rectFromPoints(130, 80, 190, 140), items)).toEqual([]);
  });
});
