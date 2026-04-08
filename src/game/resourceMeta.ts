import type { ResourceKey } from './types';

export const resourceKeys: ResourceKey[] = ['time', 'reputation', 'discipline', 'documents', 'tech'];

export const defaultResourceImagePaths: Record<ResourceKey, string> = {
  time: '/resource-icons/time.png',
  reputation: '/resource-icons/reputation.png',
  discipline: '/resource-icons/discipline.png',
  documents: '/resource-icons/documents.png',
  tech: '/resource-icons/tech.png',
};

export const resourceLabelsUk: Record<ResourceKey, string> = {
  time: 'Час',
  reputation: 'Авторитет',
  discipline: 'Дисципліна',
  documents: 'Документи',
  tech: 'Технології',
};
