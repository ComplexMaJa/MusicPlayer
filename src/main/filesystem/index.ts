import fs from 'fs';
import path from 'path';
import { SUPPORTED_EXTENSIONS } from '../../shared/constants';

const SKIPPED_WINDOWS_SYSTEM_DIRS = new Set([
  '$recycle.bin',
  'system volume information',
  '$winreagent',
  'recovery',
]);

function shouldSkipDirectory(dirName: string): boolean {
  if (dirName.startsWith('.')) return true;
  if (process.platform === 'win32') {
    return SKIPPED_WINDOWS_SYSTEM_DIRS.has(dirName.toLowerCase());
  }
  return false;
}

function canonicalKey(realPath: string): string {
  return process.platform === 'win32' ? realPath.toLowerCase() : realPath;
}

export async function findAudioFilesRecursive(
  dirPath: string
): Promise<{ files: string[]; hasErrors: boolean }> {
  const audioFiles: string[] = [];
  const visitedDirs = new Set<string>();
  let hasErrors = false;

  async function walk(currentDir: string) {
    try {
      const realDir = await fs.promises.realpath(currentDir);
      const dirKey = canonicalKey(realDir);
      if (visitedDirs.has(dirKey)) {
        return;
      }
      visitedDirs.add(dirKey);

      const entries = await fs.promises.readdir(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);
        if (entry.isDirectory()) {
          if (!shouldSkipDirectory(entry.name)) {
            await walk(fullPath);
          }
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (SUPPORTED_EXTENSIONS.includes(ext)) {
            audioFiles.push(fullPath);
          }
        }
      }
    } catch (err) {
      console.warn(`Could not read directory ${currentDir}:`, err);
      hasErrors = true;
    }
  }

  await walk(dirPath);
  return { files: audioFiles, hasErrors };
}
