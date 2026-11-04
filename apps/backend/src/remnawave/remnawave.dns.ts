// Connect-time address check for calls to a Remnawave panel (SSRF guard). It runs where the
// connection is made, so DNS rebinding (a name that first looks public and then points inside) does
// not get around it.
//
//  - Always refused: the unspecified address and link-local ranges (169.254.0.0/16 holds the cloud
//    metadata service at 169.254.169.254, fe80::/10 its IPv6 sibling).
//  - Refused for a *name*: loopback. A panel on this very host must be given as `localhost` or an
//    IP, never as a public name that happens to resolve to 127.0.0.1.
//  - Private ranges stay allowed: a panel on a private network or an overlay (Tailscale) is a
//    normal setup, and adding a panel is an owner-only action.

import { lookup as dnsLookup, type LookupAddress } from 'node:dns';
import { isIP } from 'node:net';

const stripV4Mapped = (a: string): string => a.replace(/^::ffff:/i, '');

export function isBlockedAddress(address: string, hostIsLiteral: boolean): boolean {
  const a = stripV4Mapped(address.toLowerCase());
  if (a === '0.0.0.0' || a === '::' || a.startsWith('0.')) return true;
  if (a.startsWith('169.254.') || /^fe[89ab][0-9a-f]:/.test(a)) return true;
  if (!hostIsLiteral && (a.startsWith('127.') || a === '::1')) return true;
  return false;
}

/** `localhost` is a name for the loopback by definition, so it counts as "explicit". */
export const hostIsExplicit = (host: string): boolean =>
  isIP(host.replace(/^\[|\]$/g, '')) !== 0 || host.toLowerCase() === 'localhost';

type LookupCb = (
  err: NodeJS.ErrnoException | null,
  address: string | LookupAddress[],
  family?: number,
) => void;

/** `lookup` option for http(s).Agent: resolves normally, then vets every answer. */
export function guardedLookup(
  hostname: string,
  options: Parameters<typeof dnsLookup>[1],
  cb: LookupCb,
): void {
  const explicit = hostIsExplicit(hostname);
  dnsLookup(
    hostname,
    options as never,
    (err: NodeJS.ErrnoException | null, result: unknown, family?: number) => {
      if (err) {
        cb(err, '' as never);
        return;
      }
      const answers = (
        Array.isArray(result) ? result : [{ address: result as string, family }]
      ) as LookupAddress[];
      const bad = answers.find((x) => isBlockedAddress(x.address, explicit));
      if (bad) {
        const e: NodeJS.ErrnoException = new Error(`blocked address for ${hostname}`);
        e.code = 'EBLOCKED';
        cb(e, '' as never);
        return;
      }
      if (Array.isArray(result)) cb(null, result as LookupAddress[]);
      else cb(null, result as string, family);
    },
  );
}
