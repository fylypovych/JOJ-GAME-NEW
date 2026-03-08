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
  'Бюрократичний всесвіт відкрив шампанське, але не з того приводу',
  'Канцелярський маятник хитнувся рівно в бік пригод',
  'Архівні боги перегорнули сторінку зі словами "ну почалося"',
  'Службовий таймер тактовно повідомив: час для дрібної катастрофи',
  'Печатка долі поставила штамп "ой, а хто це підписав?"',
];
const lyapClosers = [
  'Кава назвала це "робочим вайбом" і втекла холонути.',
  'Папки зберегли обличчя, але всередині вже панікують.',
  'Протокол зітхнув і пішов шукати нову редакцію.',
  'Саркастичний метроном відбив ритм "перепідписати до ранку".',
  'Усе під контролем. У чужому кабінеті.',
];
const scandalIntros = [
  'Інфопривід увірвався в ефір без акредитації',
  'Редакція внутрішніх мемів отримала преміум-підписку на сюжет',
  'Пресслужба попросила всіх зберігати спокій, але мікрофони вже були увімкнені',
  'Новина дня зайшла без стуку і сіла в крісло головуючого',
  'У стрічці подій увімкнувся режим "гаряче і трохи соромно"',
];
const scandalClosers = [
  'Нарада офіційно перейшла в жанр політичної сатири.',
  'Система не панікує, вона "оперативно вигадує формулювання".',
  'Журнали попросили окрему вкладку "не показувати ревізії".',
  'Офіційна версія вже готується. Неофіційна вже в чатах.',
  'Робоча атмосфера стала значно кінематографічнішою.',
];
const supportIntros = [
  'Штаб добрих намірів натиснув кнопку "виручай"',
  'Логістика посміхнулась так, ніби все це було за планом',
  'Канцелярський всесвіт на мить згадав, що він теж може допомагати',
  'Система зробила впевнений вигляд, і цього разу це реально допомогло',
  'Внутрішній відділ підтримки відповів швидше, ніж мем у чаті',
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
}) => {
  const seed = `${args.seq}:${args.cardTitle}:lyap-played`;
  const intros = [
    'акуратно підклав канцелярську бананову шкірку',
    'оформив адресну несподіванку',
    'запустив персональний бюрократичний сюрприз',
    'прицільно відправив паперову турбулентність',
  ];
  return `🎯 [${args.seq}] ${args.sourcePlayerLabel} ${choose(seed, intros)} карткою «${args.cardTitle}» (${args.categoryLabel}) на ${args.targetPlayerLabel}. "${args.flavor}". Ефект: ${args.effectText}.`;
};

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
  const seed = `${args.seq}:${args.cardTitle}:command`;
  const intros = [
    'оголосив рішення, яке "тимчасово назавжди"',
    'підписав документ із таким оптимізмом, ніби аудит у відпустці',
    'урочисто запустив новий порядок, який тепер треба пояснювати',
    'впевнено перевів розмову в режим наказу та післясмаку',
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
    'бюрократична драбина скрипнула, але урочисто витримала',
    'кадровий протокол кивнув так, ніби все саме так і планував',
    'наказ дійшов, підписався і дивом не загубився в папках',
    'службова фортуна поставила підпис рівно там, де треба',
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
    'відкрив легендарний відсік без погодження, але вчасно',
    'дістав карту, після якої чат зазвичай переходить на caps lock',
    'урочисто натиснув кнопку "сюжет, але голосніше"',
    'попросив історію зробити крок уперед і не озиратися',
  ];
  const base = `🃏 [${args.seq}] ${args.playerLabel} ${choose(seed, intros)}: «${args.cardTitle}».`;
  return args.specialMessage ? `${base} ${args.specialMessage}` : base;
};

export const legendaryTexts = {
  budanovCanceled: (playerLabel: string, cardTitle: string, effectText: string) =>
    `Сміх Буданова спрацював як точковий РЕБ по драмі: для ${playerLabel} скасовано «${cardTitle}» (${effectText}).`,
  budanovNoTarget: () => 'Сміх Буданова прозвучав переконливо, але в скиді не знайшлося драми належного калібру.',
  starlinkCanceled: (playerLabel: string, cardTitle: string, effectText: string) =>
    `«Старлінк» повернув зв’язок із реальністю та здоровим глуздом: для ${playerLabel} скасовано «${cardTitle}» (${effectText}).`,
  starlinkNoTarget: () => '«Старлінк» увімкнувся, але скандали в скиді дружно зробили вигляд, що вони не в мережі.',
  posmishkaMalyuka: (playerLabel: string) =>
    `«Посмішка Малюка» додає ${playerLabel} ще один швидкий розіграш з руки. Стіл лише нервово переглянувся.`,
  sukhpayActivated: (playerLabel: string) =>
    `«Сухпай ЗСУ» активовано для ${playerLabel}: якщо до наступного ходу гримне скандал, дисципліна підросте на +1.`,
  sukhpayTriggered: (playerLabel: string) =>
    `«Сухпай ЗСУ» спрацював за призначенням: ${playerLabel} отримує +1 Дисципліна після чужого скандалу.`,
  grammarShield: (playerLabel: string) =>
    `Грамота офіційно оголосила ${playerLabel} тимчасово недоторканним для ЛЯП/СКАНДАЛ. Навіть хаос читає накази.`,
  droidDemote: (targetLabel: string, fromRank: string, toRank: string) =>
    `«Дрончик» відпрацював по ${targetLabel} з бюрократичною точністю: звання посунулося ${fromRank} → ${toRank}.`,
  waterRestore: (playerLabel: string, resourceLabel: string, before: number, after: number) =>
    after > before
      ? `«Вода “Прозора”» привела ${resourceLabel} для ${playerLabel} до бойового стану: ${before} → ${after}.`
      : `«Вода “Прозора”» перевірила ${resourceLabel} у ${playerLabel} і сказала: "та ви й так красавці" (${before}).`,
  statueTor: (playerLabel: string, resourceLabel: string) =>
    `«Статуя Святого ТОРа» благословила ${playerLabel} на +3 ${resourceLabel}, а решті видала по документу "щоб не розслаблялись".`,
  churchLeadership: (playerLabel: string) =>
    `«Церква Святого Лідерства» підсилила ${playerLabel} (+2 Час, +2 Авторитет), а решті видала короткий курс зі скромності (-1 Авторитет).`,
  goodPressOfficerGranted: (playerLabel: string, rankName: string, bonusText: string) =>
    `«Хороший прес-офіцер» подав матеріал настільки красиво, що ${playerLabel} отримує ${rankName} без перевірки вимог. Бонус звання: ${bonusText}.`,
  goodPressOfficerNoChange: (playerLabel: string, rankName: string) =>
    `«Хороший прес-офіцер» відпрацював бездоганно, але ${playerLabel} вже має ${rankName} або вище — піар спрацював, гравітація ні.`,
};
