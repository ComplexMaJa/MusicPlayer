/**
 * Color extraction, validation, and palette generation utility for Dynamic Album-Art Theming
 */

export interface ExtractedPalette {
  dominant: string;     // Primary dominant color (hex)
  accent: string;       // High-contrast, vibrant accent color for text & active UI (hex)
  secondary: string;    // Complementary secondary color (hex)
  ambient1: string;     // Primary ambient glow (rgba)
  ambient2: string;     // Secondary atmospheric glow (rgba)
  accentGlow: string;   // Text shadow and button glow (rgba)
}

export const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

const MAX_PALETTE_CACHE_SIZE = 128;
const paletteCache = new Map<string, ExtractedPalette>();
const inFlightExtractions = new Map<string, Promise<ExtractedPalette | null>>();

let sharedCanvas: HTMLCanvasElement | null = null;

function getSharedCanvas(): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  if (!sharedCanvas) {
    sharedCanvas = document.createElement('canvas');
    sharedCanvas.width = 48;
    sharedCanvas.height = 48;
  }
  return sharedCanvas;
}

/**
 * Validates and normalizes a 6-digit hex color string, returning fallback if invalid.
 */
export function normalizeHexColor(color?: string, fallback = '#FF2E55'): string {
  if (typeof color === 'string') {
    const trimmed = color.trim();
    if (HEX_COLOR_RE.test(trimmed)) {
      return trimmed.toUpperCase();
    }
  }
  return fallback;
}

function parseColorToRgb(color: string | undefined, fallback = '#FF2E55'): [number, number, number] {
  if (typeof color === 'string') {
    const trimmed = color.trim();
    if (HEX_COLOR_RE.test(trimmed)) {
      return [
        parseInt(trimmed.slice(1, 3), 16),
        parseInt(trimmed.slice(3, 5), 16),
        parseInt(trimmed.slice(5, 7), 16),
      ];
    }
    const shortHex = /^#([0-9a-fA-F]{3})$/.exec(trimmed);
    if (shortHex) {
      const [r, g, b] = shortHex[1].split('');
      return [
        parseInt(r + r, 16),
        parseInt(g + g, 16),
        parseInt(b + b, 16),
      ];
    }
    const rgbMatch = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*[\d.]+\s*)?\)$/i.exec(trimmed);
    if (rgbMatch) {
      return [
        Math.max(0, Math.min(255, Number(rgbMatch[1]))),
        Math.max(0, Math.min(255, Number(rgbMatch[2]))),
        Math.max(0, Math.min(255, Number(rgbMatch[3]))),
      ];
    }
  }
  const safeFallback = normalizeHexColor(fallback, '#FF2E55');
  return [
    parseInt(safeFallback.slice(1, 3), 16),
    parseInt(safeFallback.slice(3, 5), 16),
    parseInt(safeFallback.slice(5, 7), 16),
  ];
}

/**
 * Converts any valid hex or rgb/rgba color string into an rgba(...) string with the requested alpha.
 */
export function colorWithAlpha(color: string | undefined, alpha: number, fallback = '#FF2E55'): string {
  const safeAlpha = Number.isFinite(alpha) ? Math.max(0, Math.min(1, alpha)) : 1;
  const [r, g, b] = parseColorToRgb(color, fallback);
  return `rgba(${r}, ${g}, ${b}, ${safeAlpha})`;
}

/**
 * Derives a slightly brighter hover hex color from a validated #RRGGBB accent color.
 */
export function getHoverAccentHex(hexColor: string): string {
  const safeHex = normalizeHexColor(hexColor);
  const [r, g, b] = parseColorToRgb(safeHex);
  const mix = (channel: number) => Math.round(channel + (255 - channel) * 0.16);
  return rgbToHex(mix(r), mix(g), mix(b));
}

function getCachedPalette(imageUrl: string): ExtractedPalette | undefined {
  const hit = paletteCache.get(imageUrl);
  if (!hit) return undefined;
  // Refresh LRU recency
  paletteCache.delete(imageUrl);
  paletteCache.set(imageUrl, hit);
  return hit;
}

function setCachedPalette(imageUrl: string, palette: ExtractedPalette): void {
  if (paletteCache.has(imageUrl)) {
    paletteCache.delete(imageUrl);
  }
  while (paletteCache.size >= MAX_PALETTE_CACHE_SIZE) {
    const oldestKey = paletteCache.keys().next().value;
    if (oldestKey === undefined) break;
    paletteCache.delete(oldestKey);
  }
  paletteCache.set(imageUrl, palette);
}

/**
 * Converts RGB to HSL
 */
function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }

  return [h * 360, s, l];
}

/**
 * Converts HSL back to RGB
 */
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  h /= 360;
  let r: number;
  let g: number;
  let b: number;

  if (s === 0) {
    r = g = b = l; // achromatic
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };

    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }

  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (c: number) => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function circularHueDistance(h1: number, h2: number): number {
  const diff = Math.abs(h1 - h2);
  return Math.min(diff, 360 - diff);
}

/**
 * Fallback palette generator derived from the active accent color
 */
export function getFallbackPalette(defaultAccent = '#FF2E55'): ExtractedPalette {
  const safeAccent = normalizeHexColor(defaultAccent);
  const [r, g, b] = parseColorToRgb(safeAccent);
  const [h, s] = rgbToHsl(r, g, b);
  const [domR, domG, domB] = hslToRgb(h, Math.min(0.75, s * 0.7), 0.08);
  const [secR, secG, secB] = hslToRgb(h, Math.max(0.45, s * 0.8), 0.30);

  return {
    dominant: rgbToHex(domR, domG, domB),
    accent: safeAccent,
    secondary: rgbToHex(secR, secG, secB),
    ambient1: `rgba(${r}, ${g}, ${b}, 0.25)`,
    ambient2: `rgba(${secR}, ${secG}, ${secB}, 0.18)`,
    accentGlow: `rgba(${r}, ${g}, ${b}, 0.55)`,
  };
}

function extractPaletteInternal(imageUrl: string): Promise<ExtractedPalette | null> {
  const existing = inFlightExtractions.get(imageUrl);
  if (existing) return existing;

  const promise = new Promise<ExtractedPalette | null>((resolve) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';

    const cleanup = () => {
      img.onload = null;
      img.onerror = null;
    };

    img.onload = () => {
      try {
        const canvas = getSharedCanvas();
        const ctx = canvas?.getContext('2d', { willReadFrequently: true });
        if (!canvas || !ctx) {
          resolve(null);
          return;
        }

        const width = canvas.width;
        const height = canvas.height;
        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);

        const imgData = ctx.getImageData(0, 0, width, height).data;
        const colorCounts: Record<string, { r: number; g: number; b: number; count: number; sat: number; light: number }> = {};

        for (let i = 0; i < imgData.length; i += 16) {
          const r = imgData[i];
          const g = imgData[i + 1];
          const b = imgData[i + 2];
          const a = imgData[i + 3];

          if (a < 128) continue;

          const [, s, l] = rgbToHsl(r, g, b);

          const qR = Math.round(r / 24) * 24;
          const qG = Math.round(g / 24) * 24;
          const qB = Math.round(b / 24) * 24;
          const key = `${qR},${qG},${qB}`;

          if (!colorCounts[key]) {
            colorCounts[key] = { r: qR, g: qG, b: qB, count: 0, sat: s, light: l };
          }
          colorCounts[key].count++;
        }

        const colors = Object.values(colorCounts);
        if (colors.length === 0) {
          resolve(null);
          return;
        }

        colors.sort((a, b) => b.count - a.count);
        const dom = colors[0];

        const vibrantCandidates = colors.filter(
          (c) => c.sat >= 0.25 && c.light >= 0.25 && c.light <= 0.85
        );

        const accentCandidate = vibrantCandidates.length > 0
          ? [...vibrantCandidates].sort(
              (a, b) =>
                b.sat * 1.5 + (1 - Math.abs(b.light - 0.6)) -
                (a.sat * 1.5 + (1 - Math.abs(a.light - 0.6)))
            )[0]
          : dom;

        const [accH, accS] = rgbToHsl(accentCandidate.r, accentCandidate.g, accentCandidate.b);
        const tunedAccentLight = 0.58;
        const tunedAccentSat = Math.max(0.70, Math.min(0.95, accS * 1.3));
        const [accR, accG, accB] = hslToRgb(accH, tunedAccentSat, tunedAccentLight);
        const accentHex = rgbToHex(accR, accG, accB);

        const secCandidate =
          colors.find((c) => circularHueDistance(rgbToHsl(c.r, c.g, c.b)[0], accH) > 30) || dom;
        const [secH, secS] = rgbToHsl(secCandidate.r, secCandidate.g, secCandidate.b);
        const [secR, secG, secB] = hslToRgb(secH, Math.max(0.5, secS), 0.45);
        const secondaryHex = rgbToHex(secR, secG, secB);

        const palette: ExtractedPalette = {
          dominant: rgbToHex(dom.r, dom.g, dom.b),
          accent: accentHex,
          secondary: secondaryHex,
          ambient1: `rgba(${accR}, ${accG}, ${accB}, 0.28)`,
          ambient2: `rgba(${secR}, ${secG}, ${secB}, 0.22)`,
          accentGlow: `rgba(${accR}, ${accG}, ${accB}, 0.55)`,
        };

        setCachedPalette(imageUrl, palette);
        resolve(palette);
      } catch (err) {
        console.warn('Error extracting color palette:', err);
        resolve(null);
      } finally {
        cleanup();
      }
    };

    img.onerror = () => {
      cleanup();
      resolve(null);
    };

    img.src = imageUrl;
  }).finally(() => {
    inFlightExtractions.delete(imageUrl);
  });

  inFlightExtractions.set(imageUrl, promise);
  return promise;
}

/**
 * Extracts a dynamic, dark-mode optimized color palette from an image URL
 */
export async function extractPaletteFromImage(
  imageUrl: string,
  fallbackAccent = '#FF2E55'
): Promise<ExtractedPalette> {
  if (!imageUrl) return getFallbackPalette(fallbackAccent);

  const cached = getCachedPalette(imageUrl);
  if (cached) return cached;

  const extracted = await extractPaletteInternal(imageUrl);
  return extracted ?? getFallbackPalette(fallbackAccent);
}
