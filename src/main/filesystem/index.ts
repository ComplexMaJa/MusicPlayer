import fs from 'fs';
import path from 'path';
import { SUPPORTED_EXTENSIONS } from '../../shared/constants';

export async function findAudioFilesRecursive(
  dirPath: string
): Promise<{ files: string[]; hasErrors: boolean }> {
  const audioFiles: string[] = [];
  let hasErrors = false;

  async function walk(currentDir: string) {
    try {
      const entries = await fs.promises.readdir(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);
        if (entry.isDirectory()) {
          // Avoid scanning hidden directories or system folders
          if (!entry.name.startsWith('.')) {
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
