const moduleDisplayNameByKey: Record<string, string> = {
  vvnz_default: 'VVNZ',
  legendary_default: 'Legendary',
  rank_default: 'Rank Track',
};

const prettifyModuleToken = (value: string) => value
  .toLowerCase()
  .split(/[_-\s]+/g)
  .filter(Boolean)
  .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
  .join(' ');

export const formatModuleDisplayName = (name: string, moduleId = ''): string => {
  const normalizedId = String(moduleId).trim().toLowerCase();
  const normalizedName = String(name).trim();
  if (normalizedId && moduleDisplayNameByKey[normalizedId]) return moduleDisplayNameByKey[normalizedId];
  const normalizedNameKey = normalizedName.toLowerCase();
  if (normalizedNameKey && moduleDisplayNameByKey[normalizedNameKey]) return moduleDisplayNameByKey[normalizedNameKey];
  if (/^[A-Z0-9]+(?:[_-][A-Z0-9]+)+$/.test(normalizedName)) return prettifyModuleToken(normalizedName);
  return normalizedName || moduleId;
};
