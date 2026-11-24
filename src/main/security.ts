import { app } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';

const ALLOWED_DEV_ORIGINS = new Set(['http://localhost:5173', 'http://127.0.0.1:5173']);

/**
 * Normalizes a filesystem path for cross-platform comparison and database keys.
 * On Windows, path.resolve preserves drive-letter casing, so we canonicalize
 * the drive letter to uppercase to match database path normalization.
 */
export function normalizePlatformPath(filePath: string): string {
  const resolved = path.resolve(filePath);
  if (process.platform === 'win32') {
    return resolved.replace(/^[a-zA-Z]:/, (drive) => drive.toUpperCase());
  }
  return resolved;
}

/**
 * Normalizes a path for case-insensitive set membership / equality checks on Windows.
 */
export function normalizePathForComparison(filePath: string): string {
  const resolved = path.resolve(filePath);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

/**
 * Returns the Vite dev server URL only when running unpackaged and targeting
 * one of the expected local dev server origins.
 */
export function getTrustedDevServerUrl(): string | null {
  if (app.isPackaged) {
    return null;
  }

  const rawUrl = process.env.VITE_DEV_SERVER_URL;
  if (!rawUrl) {
    return null;
  }

  try {
    const parsed = new URL(rawUrl);
    return ALLOWED_DEV_ORIGINS.has(parsed.origin) ? parsed.toString() : null;
  } catch {
    return null;
  }
}

/**
 * Returns true only for the application's own renderer entry point (or, when
 * unpackaged in dev, the trusted Vite dev server origin). Used by both the
 * navigation guard and IPC sender validation so both enforce the same boundary.
 */
export function isAllowedInternalUrl(url: string): boolean {
  try {
    const target = new URL(url);
    const devServerUrl = getTrustedDevServerUrl();

    if (devServerUrl) {
      return target.origin === new URL(devServerUrl).origin;
    }

    if (target.protocol !== 'file:') {
      return false;
    }

    const targetPath = path.resolve(fileURLToPath(target));
    const rendererIndexPath = path.resolve(__dirname, '../renderer/index.html');

    return process.platform === 'win32'
      ? targetPath.toLowerCase() === rendererIndexPath.toLowerCase()
      : targetPath === rendererIndexPath;
  } catch {
    return false;
  }
}
