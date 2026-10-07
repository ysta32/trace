import { describe, it, expect } from 'vitest';
import { RequestTracker } from './requests';

describe('RequestTracker', () => {
  it('runs one job at a time and keeps only the newest queued', () => {
    const t = new RequestTracker<string>();
    const a = t.request('a');
    expect(t.take()).toEqual({ id: a, job: 'a' });
    const b = t.request('b');
    const c = t.request('c');
    expect(t.take()).toBeNull();
    expect(t.finish(a)).toEqual({ released: true, current: false });
    expect(t.take()).toEqual({ id: c, job: 'c' });
    expect(t.isCurrent(b)).toBe(false);
  });
  it('invalidate drops queued work and stales in-flight reply', () => {
    const t = new RequestTracker<string>();
    const a = t.request('a');
    t.take();
    t.request('b');
    t.invalidate();
    expect(t.take()).toBeNull();
    expect(t.finish(a)).toEqual({ released: true, current: false });
    expect(t.idle).toBe(true);
  });
  it('unrelated ids do not release the active slot', () => {
    const t = new RequestTracker<string>();
    const a = t.request('a');
    t.take();
    expect(t.finish(999)).toEqual({ released: false, current: false });
    expect(t.idle).toBe(false);
    expect(t.finish(a).current).toBe(true);
    expect(t.idle).toBe(true);
  });
});
