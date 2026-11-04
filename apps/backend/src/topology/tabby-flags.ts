// Small inline SVG flags for Tabby profile icons (Tabby takes a FontAwesome class or an SVG string).
// Simple shapes only: they are shown at icon size. Countries without an entry fall back to a generic
// server icon. Codes are ISO 3166-1 alpha-2.

const svg = (body: string) =>
  `<svg viewBox="0 0 3 2" xmlns="http://www.w3.org/2000/svg">${body}</svg>`;
const bands = (colors: string[], vertical = false): string =>
  colors
    .map((c, i) => {
      const n = colors.length;
      return vertical
        ? `<rect x="${(3 / n) * i}" width="${3 / n}" height="2" fill="${c}"/>`
        : `<rect y="${(2 / n) * i}" width="3" height="${2 / n}" fill="${c}"/>`;
    })
    .join('');
const cross = (bg: string, fg: string, x = 1.2, w = 0.6, h = 0.6) =>
  `<rect width="3" height="2" fill="${bg}"/><path d="M${x} 0h${w}v2h-${w}z M0 ${(2 - h) / 2}h3v${h}h-3z" fill="${fg}"/>`;

export const FLAG_SVG: Record<string, string> = {
  RU: svg(bands(['#ffffff', '#0039a6', '#d52b1e'])),
  UA: svg(bands(['#0057b7', '#ffd700'])),
  BY: svg(`${bands(['#cf101a', '#007c30'])}<rect width="0.4" height="2" fill="#ffffff"/>`),
  PL: svg(bands(['#ffffff', '#dc143c'])),
  DE: svg(bands(['#000000', '#dd0000', '#ffce00'])),
  FR: svg(bands(['#0055a4', '#ffffff', '#ef4135'], true)),
  IT: svg(bands(['#008f4c', '#ffffff', '#c0311a'], true)),
  ES: svg(`${bands(['#aa151b', '#f1bf00', '#aa151b'])}`),
  NL: svg(bands(['#ae1c28', '#ffffff', '#21468b'])),
  AT: svg(bands(['#ed2939', '#ffffff', '#ed2939'])),
  LV: svg(
    `<rect width="3" height="2" fill="#9e3039"/><rect y="0.8" width="3" height="0.4" fill="#ffffff"/>`,
  ),
  LT: svg(bands(['#fdb913', '#006a44', '#c1272d'])),
  EE: svg(bands(['#0072ce', '#000000', '#ffffff'])),
  RO: svg(bands(['#002b7f', '#fcd116', '#ce1126'], true)),
  BG: svg(bands(['#ffffff', '#00966e', '#d62612'])),
  HU: svg(bands(['#cd2a3e', '#ffffff', '#436f4d'])),
  LU: svg(bands(['#ed2939', '#ffffff', '#00a1de'])),
  AM: svg(bands(['#d90012', '#0033a0', '#f2a800'])),
  FI: svg(cross('#ffffff', '#002f6c', 0.9)),
  SE: svg(cross('#006aa7', '#fecc00', 0.9, 0.4, 0.4)),
  NO: svg(
    `<rect width="3" height="2" fill="#ba0c2f"/><path d="M0.8 0h0.6v2h-0.6z M0 0.7h3v0.6h-3z" fill="#ffffff"/><path d="M0.95 0h0.3v2h-0.3z M0 0.85h3v0.3h-3z" fill="#00205b"/>`,
  ),
  DK: svg(
    `<rect width="3" height="2" fill="#c8102e"/><path d="M0.9 0h0.4v2h-0.4z M0 0.8h3v0.4h-3z" fill="#ffffff"/>`,
  ),
  GB: svg(cross('#ffffff', '#ce1124', 1.2)),
  CH: svg(
    `<rect width="3" height="2" fill="#d52b1e"/><path d="M1.3 0.4h0.4v0.5h0.5v0.4h-0.5v0.5h-0.4v-0.5h-0.5v-0.4h0.5z" fill="#ffffff"/>`,
  ),
  CZ: svg(`${bands(['#ffffff', '#d7141a'])}<path d="M0 0l1.5 1l-1.5 1z" fill="#11457e"/>`),
  GE: svg(
    `<rect width="3" height="2" fill="#ffffff"/><path d="M1.3 0h0.4v2h-0.4z M0 0.8h3v0.4h-3z" fill="#ff0000"/>`,
  ),
  TR: svg(
    `<rect width="3" height="2" fill="#e30a17"/><circle cx="1.1" cy="1" r="0.5" fill="#ffffff"/><circle cx="1.25" cy="1" r="0.4" fill="#e30a17"/>`,
  ),
  JP: svg(
    `<rect width="3" height="2" fill="#ffffff"/><circle cx="1.5" cy="1" r=".6" fill="#bc002d"/>`,
  ),
  SG: svg(
    `${bands(['#ef3340', '#ffffff'])}<circle cx="0.6" cy="0.5" r="0.28" fill="#ffffff"/><circle cx="0.7" cy="0.5" r="0.25" fill="#ef3340"/>`,
  ),
  KZ: svg(
    `<rect width="3" height="2" fill="#00afca"/><circle cx="1.5" cy="0.9" r="0.32" fill="#fcd116"/>`,
  ),
  US: svg(
    `<rect width="3" height="2" fill="#ffffff"/><path d="M0 0.15h3M0 0.46h3M0 0.77h3M0 1.08h3M0 1.38h3M0 1.69h3" stroke="#b31942" stroke-width="0.15"/><rect width="1.3" height="1.08" fill="#0a3161"/>`,
  ),
  CA: svg(
    `<rect width="3" height="2" fill="#ffffff"/><rect width="0.75" height="2" fill="#d52b1e"/><rect x="2.25" width="0.75" height="2" fill="#d52b1e"/><circle cx="1.5" cy="1" r="0.3" fill="#d52b1e"/>`,
  ),
};

export const DEFAULT_ICON = 'fas fa-desktop';

export const flagIcon = (country: string | null | undefined): string =>
  (country && FLAG_SVG[country.toUpperCase()]) || DEFAULT_ICON;
