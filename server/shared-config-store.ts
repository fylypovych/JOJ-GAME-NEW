import path from 'node:path';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

export const createSharedConfigStore = ({
  templatePath, ranksPath, exportSharedDeckTemplateJson, importSharedDeckTemplateJson, getSharedRanks, setSharedRanks, resetSharedRanks,
}: {
  templatePath: string;
  ranksPath: string;
  exportSharedDeckTemplateJson: () => string;
  importSharedDeckTemplateJson: (text: string) => { ok: true } | { ok: false; error: string };
  getSharedRanks: () => unknown;
  setSharedRanks: (value: any) => boolean;
  resetSharedRanks: () => void;
}) => {
  const saveTemplateToDisk = async () => {
    await mkdir(path.dirname(templatePath), { recursive: true });
    await writeFile(templatePath, exportSharedDeckTemplateJson(), 'utf8');
  };
  const saveRanksToDisk = async () => {
    await mkdir(path.dirname(ranksPath), { recursive: true });
    await writeFile(ranksPath, JSON.stringify(getSharedRanks(), null, 2), 'utf8');
  };
  const loadTemplateFromDisk = async () => {
    try {
      const raw = await readFile(templatePath, 'utf8');
      const result = importSharedDeckTemplateJson(raw);
      if (!result.ok) {
        // eslint-disable-next-line no-console
        console.warn(`[template] invalid saved template, fallback to default: ${result.error}`);
        await saveTemplateToDisk();
      }
    } catch {
      await saveTemplateToDisk();
    }
  };
  const loadRanksFromDisk = async () => {
    try {
      const raw = await readFile(ranksPath, 'utf8');
      const parsed = JSON.parse(raw);
      const ok = setSharedRanks(parsed);
      if (!ok) {
        // eslint-disable-next-line no-console
        console.warn('[ranks] invalid saved ranks, fallback to default');
        resetSharedRanks();
        await saveRanksToDisk();
      }
    } catch {
      await saveRanksToDisk();
    }
  };
  return { saveTemplateToDisk, saveRanksToDisk, loadTemplateFromDisk, loadRanksFromDisk };
};
