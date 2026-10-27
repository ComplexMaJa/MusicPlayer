import path from 'path';
import { fileURLToPath } from 'url';

/**
 * Returns true only for the application's own renderer entry point (or, in
 * development, the Vite dev server origin). Used by both the navigation guard
 * and IPC sender validation so both enforce the same boundary.
 */
export function isAllowedInternalUrl(url: string): boolean {
  try {
    const target = new URL(url);
    const devServerUrl = process.env.VITE_DEV_SERVER_URL;

    if (devServerUrl) {
      return target.origin === new URL(devServerUrl).origin;
    }

    if (target.protocol !== 'file:') {
      return false;
    }

    const targetPath = path.resolve(fileURLToPath(target.href.split('#')[0]));
    const rendererIndexPath = path.resolve(__dirname, '../renderer/index.html');

    return process.platform === 'win32'
      ? targetPath.toLowerCase() === rendererIndexPath.toLowerCase()
      : targetPath === rendererIndexPath;
  } catch {
    return false;
  }
}
