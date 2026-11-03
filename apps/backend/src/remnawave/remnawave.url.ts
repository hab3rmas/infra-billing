// Which panel URLs may the backend call. https always; http only for localhost and private
// addresses (a panel on the same host or an overlay network), never for a public name.

const PRIVATE_V4 = [/^10\./, /^127\./, /^192\.168\./, /^172\.(1[6-9]|2\d|3[01])\./, /^169\.254\./];

export function isLocalOrPrivateHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, '');
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local')) return true;
  if (h === '::1' || /^f[cd][0-9a-f]{2}:/.test(h) || h.startsWith('fe80:')) return true;
  return PRIVATE_V4.some((re) => re.test(h));
}

export type UrlCheck = { ok: true; url: string; insecure: boolean } | { ok: false; reason: string };

export function checkPanelUrl(raw: string): UrlCheck {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return { ok: false, reason: 'Not a valid URL' };
  }
  if (u.username || u.password)
    return { ok: false, reason: 'Credentials in the URL are not allowed' };
  if (u.protocol === 'https:')
    return { ok: true, url: u.toString().replace(/\/+$/, ''), insecure: false };
  if (u.protocol === 'http:' && isLocalOrPrivateHost(u.hostname)) {
    return { ok: true, url: u.toString().replace(/\/+$/, ''), insecure: true };
  }
  return {
    ok: false,
    reason: 'Only https:// is allowed (http:// only for localhost and private addresses)',
  };
}
