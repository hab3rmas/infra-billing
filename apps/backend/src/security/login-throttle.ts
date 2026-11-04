// Brute-force protection for the sign-in routes (pure, unit-testable). Upstream has none: a panel on
// a public domain would accept unlimited password guesses.
//
// Failures are counted per client IP and per username inside a sliding window. Reaching the limit
// blocks the key for a while; every further block of the same key doubles the time (up to a cap),
// so a patient attacker gets slower and slower while the owner, who types the right password,
// is never counted.

export interface ThrottleOptions {
  windowMs: number;
  baseLockMs: number;
  maxLockMs: number;
  /** Hard cap on tracked keys, so a flood of random usernames cannot grow memory. */
  maxEntries: number;
}

export const DEFAULT_THROTTLE: ThrottleOptions = {
  windowMs: 15 * 60_000,
  baseLockMs: 15 * 60_000,
  maxLockMs: 6 * 3_600_000,
  maxEntries: 10_000,
};

interface Entry {
  failures: number[];
  lockedUntil: number;
  strikes: number;
}

export class FailureThrottle {
  private readonly entries = new Map<string, Entry>();

  constructor(private readonly opts: ThrottleOptions = DEFAULT_THROTTLE) {}

  /** Milliseconds this key stays blocked; 0 = free to try. */
  blockedFor(key: string, now = Date.now()): number {
    const e = this.entries.get(key);
    return e && e.lockedUntil > now ? e.lockedUntil - now : 0;
  }

  /** Record a failure. Returns the block duration when this failure tripped the limit, else 0. */
  recordFailure(key: string, limit: number, now = Date.now()): number {
    let e = this.entries.get(key);
    if (!e) {
      this.evictIfFull(now);
      e = { failures: [], lockedUntil: 0, strikes: 0 };
      this.entries.set(key, e);
    }
    e.failures = e.failures.filter((t) => now - t < this.opts.windowMs);
    e.failures.push(now);
    if (e.failures.length < limit) return 0;
    e.strikes += 1;
    const lock = Math.min(this.opts.baseLockMs * 2 ** (e.strikes - 1), this.opts.maxLockMs);
    e.lockedUntil = now + lock;
    e.failures = [];
    return lock;
  }

  /** A successful sign-in clears the failures (strikes stay: a past offender remains suspect). */
  recordSuccess(key: string): void {
    const e = this.entries.get(key);
    if (e) e.failures = [];
  }

  get size(): number {
    return this.entries.size;
  }

  private evictIfFull(now: number): void {
    if (this.entries.size < this.opts.maxEntries) return;
    for (const [k, e] of this.entries) {
      const idle = e.lockedUntil <= now && e.failures.every((t) => now - t >= this.opts.windowMs);
      if (idle) this.entries.delete(k);
    }
    // Still full of live entries: drop the oldest ones rather than refuse to track new keys.
    for (const k of this.entries.keys()) {
      if (this.entries.size < this.opts.maxEntries) break;
      this.entries.delete(k);
    }
  }
}

// ---- which requests count --------------------------------------------------------------------

/** Sign-in and first-run routes: every rejected attempt counts. */
const AUTH_ROUTES =
  /^\/api\/auth\/(login|setup|passkey\/login\/(options|verify)|telegram\/(login|callback))$/;

export const isSensitivePath = (path: string): boolean =>
  AUTH_ROUTES.test(path.replace(/\/+$/, ''));

/** A rejected attempt: 4xx on a sensitive route, or 401/403 anywhere for a Bearer token guess. */
export function isFailure(status: number, sensitive: boolean): boolean {
  if (status === 429) return false;
  return sensitive ? status >= 400 && status < 500 : status === 401 || status === 403;
}

const PRIVATE_PEER =
  /^(::1|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|fc|fd|::ffff:(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.))/i;

/**
 * The client address. Behind the reverse proxy (a private peer: Caddy on the docker network) the
 * proxy's X-Forwarded-For is trusted; a direct connection from the internet keeps its own address,
 * so nobody can dodge the per-IP limit by sending that header themselves.
 */
export function clientIp(
  peer: string | undefined,
  forwardedFor: string | string[] | undefined,
): string {
  const p = peer ?? 'unknown';
  const header = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor;
  if (header && PRIVATE_PEER.test(p)) {
    const first = header.split(',')[0]?.trim();
    if (first && first.length <= 64) return first;
  }
  return p;
}
