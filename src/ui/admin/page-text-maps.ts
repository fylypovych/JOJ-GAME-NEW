import type { AdminTab } from './types';

type TabTextShape = {
  tabStart: string;
  tabMatches: string;
  tabDeck: string;
  tabImportExport: string;
  tabState: string;
  tabRanks: string;
  tabDatabase: string;
  tabAnalytics: string;
  tabGithub: string;
  tabSettings: string;
  tabSimulation: string;
  tabUsers: string;
  tabAwards: string;
  tabBugReports: string;
  tabGameConfig: string;
  tabSystemAdmin: string;
};

export const buildAdminTabLabelMap = (
  t: TabTextShape,
): Record<AdminTab, string> => ({
  start: t.tabStart,
  matches: t.tabMatches,
  deck: t.tabDeck,
  import: t.tabImportExport,
  state: t.tabState,
  ranks: t.tabRanks,
  database: t.tabDatabase,
  analytics: t.tabAnalytics,
  github: t.tabGithub,
  settings: t.tabSettings,
  simulation: t.tabSimulation,
  users: t.tabUsers,
  awards: t.tabAwards,
  bugReports: t.tabBugReports,
  gameConfig: t.tabGameConfig,
  systemAdmin: t.tabSystemAdmin,
});

export const buildActiveTabDescriptionMap = (
  lang: 'uk' | 'en',
): Record<AdminTab, string> =>
  lang === 'uk'
    ? {
        start:
          'Стартова зведена панель зі станом системи, модерацією, GitHub і telemetry.',
        matches:
          'Оперативне керування матчами, швидкий перезапуск і контроль активної кімнати.',
        deck: 'Редагування карт, модулів і структури основної колоди.',
        import: 'Імпорт, експорт і пакетні операції над шаблонами.',
        ranks: 'Налаштування звань, вимог і варіантів зображень.',
        state: 'Інспекція state snapshot та аварійна зупинка поточного матчу.',
        database: 'Збереження конфігів, резервні копії та міграції БД.',
        analytics: 'Зведена телеметрія матчів, режимів і топових рангів.',
        github: 'GitHub credentials, синхронізація репозиторію та деплой.',
        users: 'Користувачі, ролі, профілі та активні сесії.',
        awards: 'Керування нагородами та умовами їх видачі.',
        bugReports: 'Черга репортів, скріншоти й модерація інцидентів.',
        settings:
          'Серверні налаштування, UI config і технічне обслуговування assets.',
        simulation:
          'Симуляції балансу, прогрес виконання і зведення по результатах.',
        gameConfig:
          'Налаштування гри: URL сервера, іконки, ресурси та параметри ботів.',
        systemAdmin:
          'Системні операції: assets, регенерація зображень, перезапуск сервера.',
      }
    : {
        start:
          'Landing overview with system health, moderation, GitHub and telemetry.',
        matches:
          'Live match operations, quick reset flow and active room control.',
        deck: 'Card, module and shared deck structure management.',
        import: 'Import, export and bulk template operations.',
        ranks: 'Rank definitions, requirements and image variants.',
        state: 'State snapshot inspection and emergency match stop.',
        database: 'Config persistence, backups and database migrations.',
        analytics: 'Match telemetry, mode trends and top rank outcomes.',
        github: 'GitHub credentials, repository sync and deploy actions.',
        users: 'Users, roles, profiles and active sessions.',
        awards: 'Award definitions and unlock rule management.',
        bugReports: 'Bug report queue, screenshots and moderation flow.',
        settings: 'Server settings, UI config and asset maintenance.',
        simulation: 'Balance simulations, run progress and result summaries.',
        gameConfig: 'Game configuration: server URL, icons, resources and bot settings.',
        systemAdmin: 'System operations: assets, image regeneration, server restart.',
      };

