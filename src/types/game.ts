export type AttributeKey =
  | 'gender'
  | 'physique'
  | 'trait'
  | 'profession'
  | 'health'
  | 'hobby'
  | 'phobia'
  | 'inventory'
  | 'backpack'
  | 'extra'
  | 'specialCard';

export type AbilityUsageType = 'instant' | 'voting' | 'passive';

export type AbilityEffectType =
  | 'heal_player'
  | 'cure_phobia'
  | 'reroll_attribute'
  | 'force_reveal'
  | 'swap_inventory'
  | 'swap_backpack'
  | 'shield_vote'
  | 'double_vote'
  | 'block_vote'
  | 'bunker_upgrade'
  | 'world_intel';

export type CardRarity = 'common' | 'rare' | 'epic' | 'legendary';

export interface SpecialAbility {
  name: string;
  description: string;
  type: AbilityUsageType;
  effectType: AbilityEffectType;
  used: boolean;
  targetValue?: string;
}

export interface AttributeCard {
  text: string;
  revealed: boolean;
  condition?: string;
  rarity?: CardRarity;
  ability?: SpecialAbility;
}

export type PlayerAttributes = Record<AttributeKey, AttributeCard>;

export interface PlayerVoteModifiers {
  shielded?: boolean;      // -1 vote against or immunity in current voting
  immune?: boolean;        // Cannot be voted against in current voting
  voteBlocked?: boolean;   // Cannot cast a vote in current voting
  doubleVote?: boolean;    // Vote counts as 2 in current voting
}

export interface PlayerData {
  uid: string;
  name: string;
  isHost: boolean;
  isAlive: boolean;
  isBot?: boolean;
  joinedAt: number;
  lastSeen: number;
  revealedInRound: number;
  voteModifiers?: PlayerVoteModifiers;
  attributes: PlayerAttributes;
}

export interface BunkerSettings {
  capacity: number;
  duration: string;
  size: number;
  supplies: string;
  catastrophe: string;
  catastropheTitle?: string;
  threats?: string;
  roundTimerSeconds: number;
  packId: string;
}

export type GameStatus =
  | 'LOBBY'
  | 'PLAYING'
  | 'VOTING'
  | 'TIE_DEFENSE'
  | 'REVOTE'
  | 'FINALE';

export interface CrisisEvent {
  title: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export interface EpilogueChapter {
  number: string;
  title: string;
  content: string;
}

export interface AISummaryData {
  generatedAt: number;
  source: 'gemini' | 'procedural';
  modelUsed?: string;
  survivalProbability: number;
  verdictTitle: string;
  verdictSummary: string;
  roleDistribution: string;
  crises: CrisisEvent[];
  outsideFate: string;
  civilizationOutcome: string;
  chapters: EpilogueChapter[];
  rawText?: string;
}

export interface RoomData {
  code: string;
  hostId: string;
  status: GameStatus;
  createdAt: number;
  updatedAt: number;
  round: number;
  currentTurnUid?: string | null;
  turnOrder?: string[];
  timerEndAt?: number | null;
  timerPausedRemaining?: number | null;
  settings: BunkerSettings;
  players: Record<string, PlayerData>;
  votes?: Record<string, string>;
  tiedCandidates?: string[];
  lastVoteTally?: Record<string, number>;
  logs: string[];
  aiSummary: AISummaryData | null;
}

export interface PackCardItem {
  id: string;
  text: string;
  condition?: string;
  rarity: CardRarity;
  ability?: Omit<SpecialAbility, 'used'>;
}

export interface CatastrophePreset {
  id: string;
  title: string;
  description: string;
  threats: string;
}

export interface BunkerPreset {
  id: string;
  name: string;
  size: number;
  duration: string;
  supplies: string;
}

export interface GamePack {
  id: string;
  name: string;
  description: string;
  version: string;
  isBuiltIn?: boolean;
  catastrophes: CatastrophePreset[];
  bunkers: BunkerPreset[];
  cards: Record<AttributeKey, PackCardItem[]>;
}

export interface FirebaseConfig {
  apiKey: string;
  authDomain?: string;
  databaseURL?: string;
  projectId: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId?: string;
}

export interface AttributeMeta {
  key: AttributeKey;
  label: string;
  shortLabel: string;
  hasAbility: boolean;
  description: string;
}

export const ATTRIBUTE_METADATA: AttributeMeta[] = [
  {
    key: 'profession',
    label: 'Профессия',
    shortLabel: 'Профессия',
    hasAbility: true,
    description: 'Основная специальность и профессиональный навык со спец. способностью',
  },
  {
    key: 'gender',
    label: 'Пол и возраст',
    shortLabel: 'Биоданные',
    hasAbility: false,
    description: 'Биологический пол, возраст и репродуктивный статус',
  },
  {
    key: 'health',
    label: 'Здоровье',
    shortLabel: 'Здоровье',
    hasAbility: false,
    description: 'Состояние организма, хронические заболевания или иммунитет',
  },
  {
    key: 'physique',
    label: 'Телосложение',
    shortLabel: 'Телосложение',
    hasAbility: false,
    description: 'Физическая форма, рост, выносливость и сила',
  },
  {
    key: 'hobby',
    label: 'Хобби / Увлечение',
    shortLabel: 'Хобби',
    hasAbility: true,
    description: 'Полезное увлечение со спец. способностью',
  },
  {
    key: 'trait',
    label: 'Человеческая черта',
    shortLabel: 'Характер',
    hasAbility: false,
    description: 'Психологический портрет и поведение в критических ситуациях',
  },
  {
    key: 'phobia',
    label: 'Фобия / Страх',
    shortLabel: 'Фобия',
    hasAbility: false,
    description: 'Иррациональный страх или триггер паники в замкнутом пространстве',
  },
  {
    key: 'inventory',
    label: 'Крупный инвентарь',
    shortLabel: 'Инвентарь',
    hasAbility: false,
    description: 'Тяжёлое оборудование или ценный груз, доставленный ко входу в бункер',
  },
  {
    key: 'backpack',
    label: 'Рюкзак',
    shortLabel: 'Рюкзак',
    hasAbility: false,
    description: 'Личные вещи и припасы в ручной клади',
  },
  {
    key: 'extra',
    label: 'Дополнительное сведение',
    shortLabel: 'Факт',
    hasAbility: false,
    description: 'Скрытый факт биографии, тайный навык или прошлое',
  },
  {
    key: 'specialCard',
    label: 'Спец. возможность',
    shortLabel: 'Спецкарта',
    hasAbility: true,
    description: 'Одноразовая тактическая карта прямого воздействия на ход игры',
  },
];

