import { ui } from '../src/ui/i18n-data-ui';

const collectPaths = (value: unknown, prefix = ''): string[] => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return prefix ? [prefix] : [];
  }
  return Object.entries(value).flatMap(([key, nested]) =>
    collectPaths(nested, prefix ? `${prefix}.${key}` : key),
  );
};

const ukPaths = new Set(collectPaths(ui.uk));
const enPaths = new Set(collectPaths(ui.en));

const missingInEn = Array.from(ukPaths).filter((path) => !enPaths.has(path));
const missingInUk = Array.from(enPaths).filter((path) => !ukPaths.has(path));

if (missingInEn.length > 0 || missingInUk.length > 0) {
  throw new Error(
    [
      missingInEn.length > 0 ? `missing in en: ${missingInEn.join(', ')}` : '',
      missingInUk.length > 0 ? `missing in uk: ${missingInUk.join(', ')}` : '',
    ]
      .filter(Boolean)
      .join('\n'),
  );
}

console.log(`i18n ok: ${ukPaths.size} leaf translations matched`);
