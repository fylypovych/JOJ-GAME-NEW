import type { SystemEventKind } from '../../game/types';

export type SystemEventMeta = {
  label: string;
  tone: 'neutral' | 'warn' | 'good' | 'legendary';
};

const explicitSystemEventMeta = (
  eventKind: SystemEventKind,
  lang: 'uk' | 'en',
): SystemEventMeta => {
  switch (eventKind) {
    case 'legendary':
      return { label: lang === 'uk' ? 'Легендарне' : 'Legendary', tone: 'legendary' };
    case 'scandal':
      return { label: 'SCANDAL', tone: 'warn' };
    case 'lyap':
      return { label: 'LYAP', tone: 'warn' };
    case 'rank':
      return { label: lang === 'uk' ? 'Звання' : 'Rank', tone: 'good' };
    case 'protection':
      return { label: lang === 'uk' ? 'Захист' : 'Protection', tone: 'neutral' };
    case 'skip':
      return { label: lang === 'uk' ? 'Пропуск' : 'Skip', tone: 'neutral' };
    default:
      return { label: lang === 'uk' ? 'Подія' : 'Event', tone: 'neutral' };
  }
};

export const classifySystemEvent = (
  textValue: string,
  lang: 'uk' | 'en',
  eventKind?: SystemEventKind,
): SystemEventMeta => {
  if (eventKind) return explicitSystemEventMeta(eventKind, lang);

  // Backward compatibility for messages stored by older server versions.
  const trimmed = textValue.trimStart();
  if (trimmed.startsWith('🃏') || trimmed.startsWith('🥫')) {
    return explicitSystemEventMeta('legendary', lang);
  }
  if (trimmed.startsWith('🎖️') || trimmed.startsWith('🎓')) {
    return explicitSystemEventMeta('rank', lang);
  }
  if (trimmed.startsWith('🛡️')) return explicitSystemEventMeta('protection', lang);
  if (trimmed.startsWith('⏭️')) return explicitSystemEventMeta('skip', lang);
  if (trimmed.startsWith('⚠️') || trimmed.startsWith('🎯')) {
    return explicitSystemEventMeta('lyap', lang);
  }
  if (trimmed.startsWith('🗞️') || trimmed.startsWith('📣')) {
    return explicitSystemEventMeta('scandal', lang);
  }
  const text = textValue.toLowerCase();
  if (text.includes('legendary') || text.includes('легендар')) {
    return explicitSystemEventMeta('legendary', lang);
  }
  if (text.includes('scandal') || text.includes('скандал')) {
    return explicitSystemEventMeta('scandal', lang);
  }
  if (text.includes('lyap') || text.includes('ляп')) {
    return explicitSystemEventMeta('lyap', lang);
  }
  if (text.includes('rank') || text.includes('звання') || text.includes('ввнз')) {
    return explicitSystemEventMeta('rank', lang);
  }
  if (text.includes('shield') || text.includes('щит')) {
    return explicitSystemEventMeta('protection', lang);
  }
  return explicitSystemEventMeta('event', lang);
};
