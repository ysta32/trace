/** Pure bookkeeping for single-flight, latest-wins job requests. */
export class RequestTracker<T> {
  private next = 1;
  private latest = 0;
  private active: number | null = null;
  private queuedJob: { id: number; job: T } | null = null;

  /** Queue a job, superseding any queued one and invalidating all earlier ids. */
  request(job: T): number {
    const id = this.next++;
    this.latest = id;
    this.queuedJob = { id, job };
    return id;
  }

  /** Invalidate every earlier id and drop queued work (in-flight job keeps its slot until it replies). */
  invalidate(): void {
    this.latest = this.next++;
    this.queuedJob = null;
  }

  /** Start the queued job if nothing is in flight. */
  take(): { id: number; job: T } | null {
    if (this.active !== null || !this.queuedJob) return null;
    const q = this.queuedJob;
    this.queuedJob = null;
    this.active = q.id;
    return q;
  }

  /** Release the in-flight slot only for the matching id; returns whether the reply is still current. */
  finish(id: number): { released: boolean; current: boolean } {
    const released = this.active === id;
    if (released) this.active = null;
    return { released, current: id === this.latest };
  }

  isCurrent(id: number): boolean {
    return id === this.latest;
  }

  get idle(): boolean {
    return this.active === null && this.queuedJob === null;
  }
}
