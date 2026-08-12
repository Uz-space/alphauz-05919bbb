export const THEMES = [
  { id: "graphite", label: "Graphite", swatch: "#1c1c1f" },
  { id: "slate", label: "Slate", swatch: "#1b2233" },
  { id: "forest", label: "Forest", swatch: "#12301f" },
  { id: "ocean", label: "Ocean", swatch: "#101c3d" },
  { id: "crimson", label: "Crimson", swatch: "#2e1010" },
  { id: "violet", label: "Violet", swatch: "#2a1030" },
  { id: "amber", label: "Amber", swatch: "#2b1c08" },
  { id: "teal", label: "Teal", swatch: "#0d2427" },
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];

export const DEFAULT_THEME: ThemeId = "graphite";
const KEY = "alpha-theme";
const HC_KEY = "alpha-theme-hc";
const HEX_KEY = "alpha-theme-hex";

export function isThemeId(v: unknown): v is ThemeId {
  return THEMES.some((t) => t.id === v);
}

export function readTheme(): ThemeId {
  try {
    const v = localStorage.getItem(KEY);
    if (isThemeId(v)) return v;
  } catch {
    /* ignore */
  }
  return DEFAULT_THEME;
}

export function readCustomHex(): string | null {
  try {
    const v = localStorage.getItem(HEX_KEY);
    return v && normalizeHex(v) ? normalizeHex(v) : null;
  } catch {
    return null;
  }
}

/** Accepts #abc / #aabbcc (with or without #). Returns #aabbcc or null. */
export function normalizeHex(input: string): string | null {
  const s = input.trim().replace(/^#/, "");
  if (/^[0-9a-fA-F]{3}$/.test(s)) {
    return `#${s[0]}${s[0]}${s[1]}${s[1]}${s[2]}${s[2]}`.toLowerCase();
  }
  if (/^[0-9a-fA-F]{6}$/.test(s)) return `#${s.toLowerCase()}`;
  return null;
}

/** sRGB hex -> OKLCH hue (deg) and chroma. */
export function hexToOklch(hex: string): { l: number; c: number; h: number } {
  const n = normalizeHex(hex) ?? "#000000";
  const toLin = (v: number) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  const r = toLin(parseInt(n.slice(1, 3), 16) / 255);
  const g = toLin(parseInt(n.slice(3, 5), 16) / 255);
  const b = toLin(parseInt(n.slice(5, 7), 16) / 255);

  const l_ = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m_ = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s_ = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);

  const L = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_;
  const A = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_;
  const B = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_;

  const c = Math.sqrt(A * A + B * B);
  let h = (Math.atan2(B, A) * 180) / Math.PI;
  if (h < 0) h += 360;
  return { l: L, c, h };
}

function setThemeColorMeta() {
  const root = document.documentElement;
  const color = getComputedStyle(root).backgroundColor;
  let meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement("meta");
    meta.setAttribute("name", "theme-color");
    document.head.appendChild(meta);
  }
  meta.setAttribute("content", color);
}

export function applyTheme(id: ThemeId) {
  const root = document.documentElement;
  root.dataset["theme"] = id;
  for (const p of [
    "--th-h",
    "--th-c",
    "--th-l",
    "--th-fg",
    "--th-fg-dim",
    "--th-line",
    "--player-accent",
    "--player-accent-dim",
  ]) {
    root.style.removeProperty(p);
  }
  try {
    localStorage.setItem(KEY, id);
    localStorage.removeItem(HC_KEY);
    localStorage.removeItem(HEX_KEY);
  } catch {
    /* ignore */
  }
  setThemeColorMeta();
}

/** Any hex color the user types becomes the app theme — shown as-is. */
export function applyCustomHex(input: string): string | null {
  const hex = normalizeHex(input);
  if (!hex) return null;
  const { l, c, h } = hexToOklch(hex);
  const L = Math.min(0.99, Math.max(0.04, l));
  const C = Math.min(0.37, c);
  const bright = L > 0.62;
  const fg = bright
    ? "oklch(0.15 0.02 " + h.toFixed(2) + ")"
    : "oklch(0.99 0.01 " + h.toFixed(2) + ")";
  const fgDim = bright
    ? "oklch(0.25 0.02 " + h.toFixed(2) + " / 70%)"
    : "oklch(0.99 0.01 " + h.toFixed(2) + " / 68%)";
  const line = bright ? "oklch(0 0 0 / 14%)" : "oklch(1 0 0 / 14%)";
  const accentL = bright ? Math.max(0.28, L - 0.34) : Math.min(0.82, L + 0.38);
  const accentC = Math.max(0.035, Math.min(0.28, C));
  const accent = `oklch(${accentL.toFixed(4)} ${accentC.toFixed(4)} ${h.toFixed(2)})`;
  const accentDim = `oklch(${accentL.toFixed(4)} ${accentC.toFixed(4)} ${h.toFixed(2)} / 42%)`;
  const root = document.documentElement;
  root.dataset["theme"] = "custom";
  root.style.setProperty("--th-h", h.toFixed(2));
  root.style.setProperty("--th-c", C.toFixed(4));
  root.style.setProperty("--th-l", L.toFixed(4));
  root.style.setProperty("--th-fg", fg);
  root.style.setProperty("--th-fg-dim", fgDim);
  root.style.setProperty("--th-line", line);
  root.style.setProperty("--player-accent", accent);
  root.style.setProperty("--player-accent-dim", accentDim);
  try {
    localStorage.setItem(KEY, "custom");
    localStorage.setItem(HEX_KEY, hex);
    localStorage.removeItem(HC_KEY);
  } catch {
    /* ignore */
  }
  setThemeColorMeta();
  return hex;
}

/** Re-apply a stored custom color on mount (in case the boot script missed it). */
export function restoreTheme() {
  const hex = readCustomHex();
  if (hex) {
    applyCustomHex(hex);
    return;
  }
  applyTheme(readTheme());
}
