import path from 'node:path';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import type { SharedConfigCoreDeps } from './types';

export const createFileSharedConfigStore = ({
  templatePath,
  ranksPath,
  exportSharedDeckTemplateJson,
  exportSharedRanksJson,
  importSharedDeckTemplateJson,
  importSharedRanksJson,
  resetSharedRanks,
}: SharedConfigCoreDeps) => {
  const saveTemplateToDisk = async () => {
    await mkdir(path.dirname(templatePath), { recursive: true });
    await writeFile(templatePath, exportSharedDeckTemplateJson(), 'utf8');
  };

  const saveRanksToDisk = async () => {
    await mkdir(path.dirname(ranksPath), { recursive: true });
    await writeFile(ranksPath, exportSharedRanksJson(), 'utf8');
  };

  const loadTemplateFromDisk = async () => {
    try {
      const raw = await readFile(templatePath, 'utf8');
      const result = importSharedDeckTemplateJson(raw);
      if (!result.ok) {
        await saveTemplateToDisk();
      }
    } catch {
      await saveTemplateToDisk();
    }
  };

  const loadRanksFromDisk = async () => {
    try {
      const raw = await readFile(ranksPath, 'utf8');
      const result = importSharedRanksJson(raw);
      if (!result.ok) {
        resetSharedRanks();
        await saveRanksToDisk();
      }
    } catch {
      await saveRanksToDisk();
    }
  };

  return { saveTemplateToDisk, saveRanksToDisk, loadTemplateFromDisk, loadRanksFromDisk };
};
