export type RulesPageContent = {
  heroKicker: string;
  heroTitle: string;
  heroDescription: string;
  philosophyTitle: string;
  philosophyPoints: string[];
  quickFacts: Array<{ label: string; value: string }>;
  resourcesTitle: string;
  resources: Array<{ key: 'time' | 'reputation' | 'discipline' | 'documents' | 'tech'; title: string; description: string }>;
  flowTitle: string;
  setupTitle: string;
  setupPoints: string[];
  turnTitle: string;
  turnSteps: Array<{ title: string; description: string }>;
  cardTypesTitle: string;
  cardTypes: Array<{ title: string; description: string }>;
  promotionTitle: string;
  promotionPoints: string[];
  modesTitle: string;
  modes: Array<{ title: string; description: string }>;
  endingTitle: string;
  endingPoints: string[];
  rankTrackTitle: string;
  rankTrackHint: string;
  rankTrackColumns: {
    rank: string;
    requirements: string;
    cost: string;
    bonus: string;
  };
  quickRulesTitle: string;
  quickRulesIntro: string;
};

export const rulesListUk = [
  'Мета: першим досягти найвищого звання або перемогти за старшинством, авторитетом і часом після виснаження колоди.',
  'Старт: кожен гравець отримує звання «Рекрут», стартові ресурси і 5 карт основної колоди.',
  'Хід: добір карти -> розіграш однієї карти -> завершення ходу.',
  'Ляп з добору б’є по тому, хто тягнув; Скандал з добору впливає на всіх.',
  'Ляп з руки грається в іншого гравця; Скандал з руки б’є по всіх, крім того, хто його зіграв.',
  'Підтримка, ВВНЗ і більшість Легендарних карт працюють на того, хто їх зіграв; Рішення командування діє на всіх.',
  'Ліміт руки: 8 карт. Якщо карт більше, надлишок треба скинути.',
  'Карти категорій Ляп і Скандал скидати добровільно не можна.',
  'Підвищення відбувається лише на наступне звання і максимум один раз за хід.',
  'Для підвищення треба виконати вимоги звання і сплатити його вартість; правило «2 за 1» тут не працює.',
  'Карта ВВНЗ вимагає сплатити 2 ресурси Часу, одразу дає бонус нового звання і змушує пропустити наступний хід.',
  'На кожному званні є ліміт місць; якщо місць немає, підвищення заблоковане.',
  'Перемога настає одразу після отримання звання Генерал або після завершення колоди за тайбрейками.',
] as const;

export const rulesListEn = [
  'Goal: reach the top rank first, or win on rank, reputation, and time after the deck is exhausted.',
  'Setup: every player starts as Recruit with starting resources and 5 main-deck cards.',
  'Turn flow: draw one card -> play one card -> end the turn.',
  'A drawn LYAP hits the drawing player; a drawn SCANDAL affects everyone.',
  'A LYAP played from hand targets another player; a SCANDAL from hand affects everyone except its source.',
  'Support, VVNZ, and most Legendary cards affect the player who played them; Command decisions affect everyone.',
  'Hand limit: 8 cards. Extra cards must be discarded.',
  'LYAP and SCANDAL cards cannot be chosen as voluntary discard.',
  'Promotion is sequential only and at most once per turn.',
  'Promotion requires both rank thresholds and promotion cost; the “2 for 1” replacement rule does not apply there.',
  'A VVNZ card costs 2 Time resources, immediately grants the new rank bonus, and makes you skip your next turn.',
  'Each rank has a seat limit, so promotion can be blocked if all slots are occupied.',
  'You win immediately by reaching General, or by tie-breakers after deck exhaustion.',
] as const;

export const rulesPageUk: RulesPageContent = {
  heroKicker: 'Стратегічно-сатирична карткова гра',
  heroTitle: 'Шлях крізь бюрократію, абсурд і кар’єрні сходи',
  heroDescription: '«Журнал Журналів» — це гра про те, як зберегти розум, авторитет і людяність у системі, де кожен документ важливіший за попередній. Ви керуєте ресурсами, переживаєте ляпи й скандали, шукаєте підтримку та пробиваєтесь від Рекрута до Генерала.',
  philosophyTitle: 'Філософія гри',
  philosophyPoints: [
    'Іронія тут не заради глузування, а як спосіб показати реальну логіку організаційного абсурду.',
    'Лідерство в грі проявляється не в ідеальних умовах, а в здатності тримати порядок посеред хаосу.',
    'Гра навчає розуміти процеси, відповідальність і людський фактор у військовому середовищі.',
  ],
  quickFacts: [
    { label: 'Головна мета', value: 'Отримати звання Генерал або виграти за тайбрейками після завершення колоди.' },
    { label: 'Що вирішує гру', value: 'Баланс часу, авторитету, дисципліни, документів і технологій.' },
    { label: 'Ключова напруга', value: 'Потрібно і розвиватись, і переживати атаки інших карт без зриву кар’єри.' },
  ],
  resourcesTitle: 'П’ять ресурсів, якими тримається вся партія',
  resources: [
    { key: 'time', title: 'Час', description: 'Головна валюта дій, контргри та переходів між званнями.' },
    { key: 'reputation', title: 'Авторитет', description: 'Визначає, чи довірятимуть вам достатньо для кар’єрного росту та перемоги в тайбрейках.' },
    { key: 'discipline', title: 'Дисципліна', description: 'Тримає систему купи й часто є обов’язковою вимогою для підвищення.' },
    { key: 'documents', title: 'Документи', description: 'Бюрократичний ресурс: без нього важко і звітувати, і рости.' },
    { key: 'tech', title: 'Технології', description: 'Сучасна перевага, яка підсилює окремі підвищення й карткові ефекти.' },
  ],
  flowTitle: 'Як проходить партія',
  setupTitle: 'Початок гри',
  setupPoints: [
    'Кожен гравець стартує зі званням «Рекрут». Воно дає по 1 одиниці кожного ресурсу.',
    'На старті всі отримують 5 карт основної колоди.',
    'Далі роздача легендарних карт залежить від вибраного режиму гри.',
  ],
  turnTitle: 'Структура ходу',
  turnSteps: [
    { title: '1. Добір', description: 'На початку ходу ви тягнете 1 карту. Деякі карти з добору активуються автоматично.' },
    { title: '2. Розіграш', description: 'Потім ви розігруєте 1 карту з руки, якщо це дозволяють її правила та ваші ресурси.' },
    { title: '3. Завершення', description: 'Після цього хід передається далі. Якщо ліміт руки перевищено, доведеться скинути надлишок.' },
  ],
  cardTypesTitle: 'Що роблять типи карт',
  cardTypes: [
    { title: 'Ляп', description: 'Якщо витягнули з колоди — шкодить вам. Якщо зіграли з руки — обираєте ціль серед інших гравців.' },
    { title: 'Скандал', description: 'З добору б’є по всіх. З руки — по всіх, крім того, хто його зіграв.' },
    { title: 'Підтримка', description: 'Працює лише на гравця, який її зіграв, і допомагає підтягнути ресурси або темп.' },
    { title: 'Рішення командування', description: 'Глобальний ефект, який впливає на всіх учасників за столом.' },
    { title: 'ВВНЗ', description: 'Працює на того, хто її зіграв: треба сплатити 2 ресурси Часу, отримати звання і його бонус, а потім пропустити наступний хід.' },
    { title: 'Легендарна карта', description: 'Дає сильну ситуативну перевагу. У більшості випадків діє на того, хто її зіграв, але окремі карти мають спеціальні умови.' },
  ],
  promotionTitle: 'Підвищення і кар’єрна драбина',
  promotionPoints: [
    'Підвищення завжди відбувається лише на наступне звання без перескакування.',
    'За один хід можна отримати максимум одне звання.',
    'Для переходу потрібно одночасно виконати вимоги звання та сплатити його вартість.',
    'Після підвищення ви одразу отримуєте бонус звання, вказаний у його параметрах.',
    'Карта ВВНЗ не використовує звичайні вимоги і вартість переходу: замість цього вона коштує 2 ресурси Часу, одразу дає бонус звання і змушує пропустити наступний хід.',
    'Правило заміни ресурсу «2 за 1» можна застосовувати для карт, але не для підвищення звання.',
    'На кожному званні є обмеження на кількість місць, тому інколи доводиться чекати або шукати інший шлях.',
  ],
  modesTitle: 'Режими гри',
  modes: [
    { title: 'Стандарт', description: 'На старті кожен отримує 5 карт з основної колоди і 5 випадкових карт з легендарної колоди. Легендарна рука окрема.' },
    { title: 'Стандарт+', description: 'На старті всі беруть 5 карт з основної колоди, а перед грою самі обирають 5 легендарних карт.' },
    { title: 'Спрощений', description: 'Легендарні карти замішуються в основну колоду й граються як звичайні карти з руки. Це правило замінює окремий легендарний розіграш.' },
  ],
  endingTitle: 'Коли завершується гра',
  endingPoints: [
    'Якщо хтось отримує звання Генерал — це миттєва перемога.',
    'Якщо колода закінчилась, гравці дограють доступні карти з руки, а потім звіряється результат.',
    'Перший тайбрейк — найвище звання.',
    'Другий тайбрейк — найбільший авторитет.',
    'Третій тайбрейк — найбільший запас часу.',
  ],
  rankTrackTitle: 'Драбина звань',
  rankTrackHint: 'Нижче показані актуальні вимоги, вартість переходу та бонуси для кожного звання прямо з ігрових даних.',
  rankTrackColumns: {
    rank: 'Звання',
    requirements: 'Вимоги',
    cost: 'Вартість переходу',
    bonus: 'Бонус звання',
  },
  quickRulesTitle: 'Коротка пам’ятка',
  quickRulesIntro: 'Якщо вже хочете грати, а не читати весь розділ, ось стисла версія найважливіших правил:',
};

export const rulesPageEn: RulesPageContent = {
  heroKicker: 'Strategic satirical card game',
  heroTitle: 'Climbing through bureaucracy, chaos, and rank pressure',
  heroDescription: '“Journal of Journals” is a game about keeping your head, reputation, and humanity inside a system where every paper trail creates a new obstacle. You manage resources, survive mistakes and scandals, find support, and climb from Recruit to General.',
  philosophyTitle: 'Game philosophy',
  philosophyPoints: [
    'The irony is not there just for laughs. It reflects the real logic of organizational absurdity.',
    'Leadership is tested in chaos, not in perfect conditions.',
    'The game is designed to build understanding of process, responsibility, and human leadership inside a military environment.',
  ],
  quickFacts: [
    { label: 'Main goal', value: 'Reach General first, or win on tie-breakers after the deck runs out.' },
    { label: 'What drives the game', value: 'Balancing time, reputation, discipline, documents, and technology.' },
    { label: 'Core tension', value: 'You must grow your career while surviving disruptive card effects.' },
  ],
  resourcesTitle: 'The five resources behind every decision',
  resources: [
    { key: 'time', title: 'Time', description: 'The main currency for actions, counterplay, and promotion costs.' },
    { key: 'reputation', title: 'Reputation', description: 'A measure of trust and a major requirement for promotion and tie-breaks.' },
    { key: 'discipline', title: 'Discipline', description: 'Keeps your structure stable and is often required for rank progression.' },
    { key: 'documents', title: 'Documents', description: 'The bureaucratic resource needed for reporting and advancement.' },
    { key: 'tech', title: 'Technology', description: 'A modern edge that improves some promotions and card effects.' },
  ],
  flowTitle: 'How a match works',
  setupTitle: 'Game setup',
  setupPoints: [
    'Every player starts at the Recruit rank. It grants 1 point of each resource.',
    'Each player starts with 5 cards from the main deck.',
    'Legendary card distribution depends on the selected game mode.',
  ],
  turnTitle: 'Turn structure',
  turnSteps: [
    { title: '1. Draw', description: 'At the start of your turn you draw 1 card. Some cards auto-resolve when drawn.' },
    { title: '2. Play', description: 'Then you may play 1 card from hand if its rules and your resources allow it.' },
    { title: '3. End', description: 'After that the turn passes on. If your hand is over the limit, you must discard down.' },
  ],
  cardTypesTitle: 'What each card type does',
  cardTypes: [
    { title: 'LYAP', description: 'If drawn, it hits you. If played from hand, you choose another player as the target.' },
    { title: 'SCANDAL', description: 'When drawn it affects everyone. From hand it affects everyone except the source player.' },
    { title: 'SUPPORT', description: 'Only affects the player who played it and helps rebuild tempo or resources.' },
    { title: 'COMMAND', description: 'A global effect that applies to every player at the table.' },
    { title: 'VVNZ', description: 'Applies to the source player: pay 2 Time resources, gain the rank and its bonus, then skip your next turn.' },
    { title: 'LEGENDARY', description: 'Provides a strong situational advantage. Most affect the player who played them, with some special exceptions.' },
  ],
  promotionTitle: 'Promotion and rank ladder',
  promotionPoints: [
    'Promotion is always sequential. You move only to the next rank.',
    'You can gain at most one rank per turn.',
    'To promote, you must meet the rank requirements and pay the promotion cost.',
    'After promotion, you immediately gain that rank’s bonus.',
    'A VVNZ card ignores the normal promotion requirements and cost: instead it costs 2 Time resources, grants the rank bonus immediately, and makes you skip your next turn.',
    'The “2 for 1” resource substitution rule may help with card play, but not with rank promotion.',
    'Each rank has a seat limit, so a promotion can be blocked if all available slots are occupied.',
  ],
  modesTitle: 'Game modes',
  modes: [
    { title: 'Standard', description: 'Each player starts with 5 main-deck cards and 5 random legendary cards in a separate legendary hand.' },
    { title: 'Standard+', description: 'Each player starts with 5 main-deck cards and drafts 5 legendary cards before the match starts.' },
    { title: 'Simplified', description: 'Legendary cards are shuffled into the main deck and played like normal hand cards. This replaces separate legendary play rules.' },
  ],
  endingTitle: 'How the game ends',
  endingPoints: [
    'Reaching General is an immediate win.',
    'If the deck is exhausted, players finish any playable cards from hand and then compare outcomes.',
    'First tie-breaker: highest rank.',
    'Second tie-breaker: highest reputation.',
    'Third tie-breaker: most remaining time.',
  ],
  rankTrackTitle: 'Rank ladder',
  rankTrackHint: 'Below is the live rank ladder from the current game data, including requirements, promotion cost, and rank bonuses.',
  rankTrackColumns: {
    rank: 'Rank',
    requirements: 'Requirements',
    cost: 'Promotion cost',
    bonus: 'Rank bonus',
  },
  quickRulesTitle: 'Quick reference',
  quickRulesIntro: 'If you want the short version before jumping into a match, these are the essentials:',
};

