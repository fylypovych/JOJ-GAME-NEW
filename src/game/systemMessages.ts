const stableIndex = (seed: string, modulo: number): number => {
  if (modulo <= 0) return 0;
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return hash % modulo;
};

const choose = (seed: string, variants: string[]) => variants[stableIndex(seed, variants.length)] ?? variants[0] ?? '';

const lyapIntros = [
  'Бюрократичний всесвіт тихо поплескав у долоні',
  'Канцелярський маятник хитнувся не в той бік',
  'Архівні боги перегорнули сторінку з виразом "ой-йой"',
  'Службовий таймер ввічливо нагадав, що ідеальність переоцінена',
  'Печатка долі поставила штамп "з несподіванкою"',
];
const lyapClosers = [
  'Кава зробила вигляд, що це просто планове тренування.',
  'Папки зберегли спокій, але нервово.',
  'Протокол зітхнув і пішов на другу ітерацію.',
  'Саркастичний метроном урочисто відбив такт.',
  'Усе під контролем. Майже.',
];
const scandalIntros = [
  'Інфопривід вийшов у прямий ефір без попередження',
  'Редакція внутрішніх мемів отримала новий сюжет',
  'Пресслужба попросила всіх дихати рівно, але запізно',
  'Новина дня постукала в двері й одразу зайшла',
  'У стрічці подій раптом зʼявився розділ "гаряче"',
];
const scandalClosers = [
  'Нарада офіційно отримала новий порядок денний.',
  'Система не панікує, вона "динамічно адаптується".',
  'Журнали попросили додаткову закладку для епічних моментів.',
  'Офіційна версія: так і було задумано.',
  'Робоча атмосфера стала помітно сюжетнішою.',
];
const supportIntros = [
  'Штаб добрих намірів увімкнув режим допомоги',
  'Логістика посміхнулась і кивнула',
  'Канцелярський всесвіт раптом став трохи людянішим',
  'Система зробила вигляд, що все під контролем, і це спрацювало',
  'Внутрішній відділ підтримки відповів швидше, ніж очікували',
];

export const buildLyapAutoMessageText = (args: {
  seq: number;
  playerLabel: string;
  cardTitle: string;
  categoryLabel: string;
  flavor: string;
  effectText: string;
}) => {
  const seed = `${args.seq}:${args.cardTitle}:lyap`;
  return `⚠️ [${args.seq}] ${choose(seed, lyapIntros)}: ${args.playerLabel} дістав «${args.cardTitle}» (${args.categoryLabel}). "${args.flavor}". Ефект: ${args.effectText}. ${choose(`${seed}:c`, lyapClosers)}`;
};

export const buildScandalAutoMessageText = (args: {
  seq: number;
  playerLabel: string;
  cardTitle: string;
  categoryLabel: string;
  flavor: string;
  targetsText: string;
}) => {
  const seed = `${args.seq}:${args.cardTitle}:scandal-auto`;
  return `🗞️ [${args.seq}] ${choose(seed, scandalIntros)}: ${args.playerLabel} підняв «${args.cardTitle}» (${args.categoryLabel}). "${args.flavor}". Кому прилетіло: ${args.targetsText}. ${choose(`${seed}:c`, scandalClosers)}`;
};

export const buildSupportMessageText = (args: {
  seq: number;
  playerLabel: string;
  cardTitle: string;
  categoryLabel: string;
  flavor: string;
  effectText: string;
}) => {
  const seed = `${args.seq}:${args.cardTitle}:support`;
  return `🤝 [${args.seq}] ${choose(seed, supportIntros)}: ${args.playerLabel} розіграв «${args.cardTitle}» (${args.categoryLabel}). "${args.flavor}". Ефект: ${args.effectText}.`;
};

export const buildPlayedLyapMessageText = (args: {
  seq: number;
  sourcePlayerLabel: string;
  targetPlayerLabel: string;
  cardTitle: string;
  categoryLabel: string;
  flavor: string;
  effectText: string;
}) =>
  `🎯 [${args.seq}] ${args.sourcePlayerLabel} розіграв «${args.cardTitle}» (${args.categoryLabel}) на ${args.targetPlayerLabel}. "${args.flavor}". Ефект: ${args.effectText}.`;

export const buildPlayedScandalMessageText = (args: {
  seq: number;
  sourcePlayerLabel: string;
  cardTitle: string;
  categoryLabel: string;
  flavor: string;
  targetsText: string;
}) => {
  const seed = `${args.seq}:${args.cardTitle}:scandal-played`;
  const intro = [
    'відкрив сезон гучних заяв',
    'запустив хвилю обговорень',
    'урочисто вніс драму в порядок денний',
    'натиснув кнопку "зараз буде цікаво"',
  ];
  return `📣 [${args.seq}] ${args.sourcePlayerLabel} ${choose(seed, intro)} карткою «${args.cardTitle}» (${args.categoryLabel}). "${args.flavor}". По столу: ${args.targetsText}.`;
};

export const buildDecisionMessageText = (args: {
  seq: number;
  sourcePlayerLabel: string;
  cardTitle: string;
  flavor: string;
  targetsText: string;
}) => {
  const seed = `${args.seq}:${args.cardTitle}:decision`;
  const intros = [
    'оголосив рішення, яке точно "тимчасове"',
    'підписав документ із великим оптимізмом',
    'урочисто запустив новий порядок',
    'впевнено перевів розмову в режим наказу',
  ];
  return `🧭 [${args.seq}] ${args.sourcePlayerLabel} ${choose(seed, intros)}: «${args.cardTitle}». "${args.flavor}". Наслідки для столу: ${args.targetsText}.`;
};

export const buildPromotionMessageText = (args: {
  seq: number;
  playerLabel: string;
  fromRankName: string;
  toRankName: string;
  costText: string;
  bonusText: string;
  totalText: string;
}) => {
  const seed = `${args.seq}:${args.toRankName}:promotion`;
  const intros = [
    'бюрократична драбина скрипнула, але витримала',
    'кадровий протокол кивнув із повагою',
    'наказ дійшов, підписався і навіть не загубився',
    'службова фортуна поставила підпис у потрібному місці',
  ];
  return `🎖️ [${args.seq}] ${choose(seed, intros)}: ${args.playerLabel} підвищився ${args.fromRankName} → ${args.toRankName}. Вартість: ${args.costText}. Бонус: ${args.bonusText}. Підсумок: ${args.totalText}.`;
};

export const buildLegendaryPlayedMessageText = (args: {
  seq: number;
  playerLabel: string;
  cardTitle: string;
  specialMessage?: string;
}) => {
  const seed = `${args.seq}:${args.cardTitle}:legendary`;
  const intros = [
    'відкрив легендарний відсік',
    'дістав карту, після якої чат зазвичай оживає',
    'урочисто натиснув на кнопку "сюжет"',
    'попросив історію зробити крок уперед',
  ];
  const base = `🃏 [${args.seq}] ${args.playerLabel} ${choose(seed, intros)}: «${args.cardTitle}».`;
  return args.specialMessage ? `${base} ${args.specialMessage}` : base;
};

export const legendaryTexts = {
  budanovCanceled: (playerLabel: string, cardTitle: string, effectText: string) =>
    `Сміх Буданова зняв напругу настільки ефективно, що для ${playerLabel} скасовано «${cardTitle}»: ${effectText}.`,
  budanovNoTarget: () => 'Сміх Буданова не знайшов у скиді ЛЯП/СКАНДАЛ, який варто було б драматично скасувати.',
  starlinkCanceled: (playerLabel: string, cardTitle: string, effectText: string) =>
    `«Старлінк» повернув зв’язок із реальністю: для ${playerLabel} скасовано скандал «${cardTitle}» (${effectText}).`,
  starlinkNoTarget: () => '«Старлінк» увімкнувся, але скандал у скиді не вийшов на зв’язок.',
  posmishkaMalyuka: (playerLabel: string) =>
    `«Посмішка Малюка» дає ${playerLabel} ще один швидкий хід з руки. Черга столу при цьому не змінюється.`,
  sukhpayActivated: (playerLabel: string) =>
    `«Сухпай ЗСУ» активовано для ${playerLabel}: якщо до його наступного ходу хтось розжене скандал, буде +1 Дисципліна.`,
  sukhpayTriggered: (playerLabel: string) =>
    `«Сухпай ЗСУ» спрацював: ${playerLabel} отримує +1 Дисципліна після чужого скандалу.`,
  grammarShield: (playerLabel: string) =>
    `Грамота офіційно оголосила ${playerLabel} тимчасово недоторканним для ЛЯП/СКАНДАЛ до його наступного ходу.`,
  droidDemote: (targetLabel: string, fromRank: string, toRank: string) =>
    `«Дрончик» відпрацював по ${targetLabel}: звання акуратно посунулося вниз ${fromRank} → ${toRank}.`,
  waterRestore: (playerLabel: string, resourceLabel: string, before: number, after: number) =>
    after > before
      ? `«Вода “Прозора”» повернула ${resourceLabel} для ${playerLabel} у придатний стан: ${before} → ${after}.`
      : `«Вода “Прозора”» оглянула ${resourceLabel} у ${playerLabel} й вирішила, що там і так все добре (${before}).`,
  statueTor: (playerLabel: string, resourceLabel: string) =>
    `«Статуя Святого ТОРа» благословила ${playerLabel} на +3 ${resourceLabel}, а решті видала по документу "для порядку".`,
  churchLeadership: (playerLabel: string) =>
    `«Церква Святого Лідерства» підсилила ${playerLabel} (+2 Час, +2 Авторитет), а решті нагадала про скромність (-1 Авторитет).`,
  goodPressOfficerGranted: (playerLabel: string, rankName: string, bonusText: string) =>
    `«Хороший прес-офіцер» так вдало подав матеріал, що ${playerLabel} отримує звання ${rankName} без перевірки вимог. Бонус звання: ${bonusText}.`,
  goodPressOfficerNoChange: (playerLabel: string, rankName: string) =>
    `«Хороший прес-офіцер» відпрацював чисто, але ${playerLabel} вже має ${rankName} або вище — додатковий стрибок не потрібен.`,
};
