/**
 * fakeRedis.ts — an in-memory Redis good enough to exercise the quota service.
 *
 * Crucially, `eval` simulates the Lua scripts *synchronously* (no awaits inside
 * the body), mirroring Redis's single-threaded atomic execution. That makes the
 * concurrent-request race test meaningful: parallel checkAndReserve() calls each
 * run their eval to completion atomically, so the counter can never be seen mid-
 * update by another call.
 */

export class FakeRedis {
  private store = new Map<string, string>();
  private ttls  = new Map<string, number>();
  private setsMap = new Map<string, Set<string>>();
  /** Records every EXPIRE call as [key, seconds] for assertions. */
  expireCalls: Array<[string, number]> = [];

  reset(): void {
    this.store.clear();
    this.ttls.clear();
    this.setsMap.clear();
    this.expireCalls = [];
  }

  // ── synchronous internals (used by eval so it stays atomic) ──
  private _incr(key: string): number {
    const v = parseInt(this.store.get(key) ?? '0', 10) + 1;
    this.store.set(key, String(v));
    return v;
  }
  private _decr(key: string): number {
    const v = parseInt(this.store.get(key) ?? '0', 10) - 1;
    this.store.set(key, String(v));
    return v;
  }
  private _ttl(key: string): number {
    if (this.ttls.has(key)) return this.ttls.get(key)!;
    return this.store.has(key) ? -1 : -2;
  }
  private _expire(key: string, sec: number): void {
    this.ttls.set(key, sec);
    this.expireCalls.push([key, sec]);
  }
  private _sadd(key: string, member: string): void {
    let s = this.setsMap.get(key);
    if (!s) { s = new Set(); this.setsMap.set(key, s); }
    s.add(member);
  }
  private _scard(key: string): number {
    return this.setsMap.get(key)?.size ?? 0;
  }

  // ── public async surface used by the service ──
  async incr(key: string): Promise<number> { return this._incr(key); }
  async decr(key: string): Promise<number> { return this._decr(key); }
  async get(key: string): Promise<string | null> { return this.store.get(key) ?? null; }
  async set(key: string, val: string): Promise<'OK'> { this.store.set(key, String(val)); return 'OK'; }
  async mget(...keys: string[]): Promise<(string | null)[]> { return keys.map(k => this.store.get(k) ?? null); }
  async expire(key: string, sec: number): Promise<number> { this._expire(key, sec); return 1; }
  async ttl(key: string): Promise<number> { return this._ttl(key); }

  async del(...keys: string[]): Promise<number> {
    let n = 0;
    for (const k of keys) { if (this.store.delete(k)) n++; this.ttls.delete(k); }
    return n;
  }

  async scan(_cursor: string, _match: string, pattern: string, _count: string, _n: number): Promise<[string, string[]]> {
    const prefix = pattern.replace(/\*$/, '');
    const keys = [...this.store.keys()].filter(k => k.startsWith(prefix));
    return ['0', keys];
  }

  /** Atomic (synchronous body) simulation of the quota Lua scripts. */
  async eval(script: string, numKeys: number, ...args: (string | number)[]): Promise<unknown> {
    const keys = args.slice(0, numKeys).map(String);
    const argv = args.slice(numKeys).map(String);

    // Abuse-detection TRACK script (SCARD + two keys)
    if (script.includes('SCARD')) {
      const [countKey, usersKey] = keys;
      const [win, userId] = argv;
      const c = this._incr(countKey!);
      if (c === 1) this._expire(countKey!, parseInt(win!, 10));
      this._sadd(usersKey!, userId!);
      if (this._ttl(usersKey!) < 0) this._expire(usersKey!, parseInt(win!, 10));
      return [c, this._scard(usersKey!)];
    }

    if (script.includes("receipt == 'refunded'")) {
      const [counter, receipt] = keys;
      const n = parseInt(this.store.get(counter!) || '0', 10);
      if (!this.store.has(receipt!) || this.store.get(receipt!) === 'refunded') return n;
      this.store.set(receipt!, 'refunded');
      return n > 0 ? this._decr(counter!) : n;
    }

    // Authenticated CHECK_AND_RESERVE (reads override at KEYS[2])
    if (numKeys === 2 || numKeys === 3) {
      const [counterKey, limitKey] = keys;
      const [planLimit, ttl] = argv;
      const override = this.store.get(limitKey!);
      const limit = override != null ? parseInt(override, 10) : parseInt(planLimit!, 10);
      const receiptKey=keys[2];
      if(receiptKey && this.store.has(receiptKey)) return [this.store.get(receiptKey)==='refunded'?0:1,parseInt(this.store.get(counterKey!)||'0',10),limit];
      const n = this._incr(counterKey!);
      if (this._ttl(counterKey!) < 0) this._expire(counterKey!, parseInt(ttl!, 10));
      if (limit >= 0 && n > limit) { this._decr(counterKey!); return [0, n - 1, limit]; }
      if(receiptKey){this.store.set(receiptKey,JSON.stringify([n,limit]));this._expire(receiptKey,parseInt(ttl!,10));}
      return [1, n, limit];
    }

    // Guest GUEST_CHECK_AND_RESERVE (single key, fixed limit)
    const [counterKey] = keys;
    const [limitS, ttl] = argv;
    const limit = parseInt(limitS!, 10);
    const n = this._incr(counterKey!);
    if (this._ttl(counterKey!) < 0) this._expire(counterKey!, parseInt(ttl!, 10));
    if (n > limit) { this._decr(counterKey!); return [0, n - 1, limit]; }
    return [1, n, limit];
  }
}
