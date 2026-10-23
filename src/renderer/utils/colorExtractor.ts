/**
 * Color extraction and palette generation utility for Dynamic Album-Art Theming
 */

export interface ExtractedPalette {
  dominant: string;     // Primary dominant color (hex)
  accent: string;       // High-contrast, vibrant accent color for text & active UI (hex)
  secondary: string;    // Complementary secondary color (hex)
  ambient1: string;     // Primary ambient glow (rgba)
  ambient2: string;     // Secondary atmospheric glow (rgba)
  accentGlow: string;   // Text shadow and button glow (rgba)
}

// In-memory cache for extracted palettes
const paletteCache = new Map<string, ExtractedPalette>();

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
  let r: number, g: number, b: number;

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

/**
 * Fallback palette generator when no artwork is present or extraction fails
 */
export function getFallbackPalette(defaultAccent = '#FF2E55'): ExtractedPalette {
  return {
    dominant: '#180A0E',
    accent: defaultAccent,
    secondary: '#88102A',
    ambient1: 'rgba(255, 46, 85, 0.25)',
    ambient2: 'rgba(180, 20, 50, 0.18)',
    accentGlow: 'rgba(255, 46, 85, 0.55)',
  };
}

/**
 * Extracts a dynamic, dark-mode optimized color palette from an image URL
 */
export async function extractPaletteFromImage(
  imageUrl: string,
  fallbackAccent = '#FF2E55'
): Promise<ExtractedPalette> {
  if (!imageUrl) return getFallbackPalette(fallbackAccent);

  // Check cache
  if (paletteCache.has(imageUrl)) {
    return paletteCache.get(imageUrl)!;
  }

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';

    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) {
          resolve(getFallbackPalette(fallbackAccent));
          return;
        }

        // Downscale for fast sampling
        const width = 48;
        const height = 48;
        canvas.width = width;
        canvas.height = height;
        ctx.drawImage(img, 0, 0, width, height);

        const imgData = ctx.getImageData(0, 0, width, height).data;
        const colorCounts: { [key: string]: { r: number; g: number; b: number; count: number; sat: number; light: number } } = {};

        // Sample pixels
        for (let i = 0; i < imgData.length; i += 16) { // Every 4th pixel
          const r = imgData[i];
          const g = imgData[i + 1];
          const b = imgData[i + 2];
          const a = imgData[i + 3];

          if (a < 128) continue; // Skip transparent pixels

          const [, s, l] = rgbToHsl(r, g, b);

          // Quantize to bucket colors
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
          const fallback = getFallbackPalette(fallbackAccent);
          paletteCache.set(imageUrl, fallback);
          resolve(fallback);
          return;
        }

        // 1. Dominant: Most frequent color
        colors.sort((a, b) => b.count - a.count);
        const dom = colors[0];

        // 2. Vibrant Accent: High saturation & balanced lightness for dark background readability
        const vibrantCandidates = [...colors].filter(
          (c) => c.sat >= 0.25 && c.light >= 0.25 && c.light <= 0.85
        );

        let accentCandidate = vibrantCandidates.length > 0
          ? vibrantCandidates.sort((a, b) => (b.sat * 1.5 + (1 - Math.abs(b.light - 0.6))) - (a.sat * 1.5 + (1 - Math.abs(a.light - 0.6))))[0]
          : dom;

        // Tune accent color for optimal contrast on dark AMOLED background:
        // Ensure Lightness is between 0.50 and 0.70 and Saturation is at least 0.65
        const [accH, accS] = rgbToHsl(accentCandidate.r, accentCandidate.g, accentCandidate.b);
        const tunedAccentLight = 0.58; // Optimal high-readability text luminance
        const tunedAccentSat = Math.max(0.70, Math.min(0.95, accS * 1.3));
        const [accR, accG, accB] = hslToRgb(accH, tunedAccentSat, tunedAccentLight);
        const accentHex = rgbToHex(accR, accG, accB);

        // 3. Secondary: Harmonic shifted or complementary color
        const secCandidate = colors.find((c) => Math.abs(rgbToHsl(c.r, c.g, c.b)[0] - accH) > 30) || dom;
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

        paletteCache.set(imageUrl, palette);
        resolve(palette);
      } catch (err) {
        console.warn('Error extracting color palette:', err);
        resolve(getFallbackPalette(fallbackAccent));
      }
    };

    img.onerror = () => {
      resolve(getFallbackPalette(fallbackAccent));
    };

    img.src = imageUrl;
  });
}
