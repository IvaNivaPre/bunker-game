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
  shielded?: boolean;      // -1 vote against in current voting
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
  packIds: string[];
  packNames?: string[];
  packId?: string; // legacy compatibility
}

export type GameStatus =
  | 'LOBBY'
  | 'PLAYING'
  | 'VOTING'
  | 'TIE_DEFENSE'
  | 'REVOTE'
  | 'FINALE';

export interface ExileResultData {
  id: string;
  round: number;
  exiledUid: string;
  exiledName: string;
  maxVotes: number;
  tally: Record<string, number>;
  voterChoices: Record<string, string>;
  timestamp: number;
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
  lastExileResult?: ExileResultData | null;
  logs: string[];
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
  threatLevel?: 'Средняя' | 'Высокая' | 'Критическая' | 'Экстремальная';
  tags: string[];
  createdAt: number;
  isBuiltIn?: boolean;
}

export interface BunkerPreset {
  id: string;
  name: string;
  size: number;
  duration: string;
  supplies: string;
  tags: string[];
  createdAt: number;
  isBuiltIn?: boolean;
}

export interface GamePack {
  id: string;
  name: string;
  description: string;
  version: string;
  tags: string[];
  createdAt: number;
  isBuiltIn?: boolean;
  cards: Record<AttributeKey, PackCardItem[]>;
  // Optional embedded presets for JSON export/import compatibility
  catastrophes?: CatastrophePreset[];
  bunkers?: BunkerPreset[];
}

export type AdminEntityFilter = 'all' | 'packs' | 'catastrophes' | 'bunkers';
export type PackSortOption = 'date' | 'alphabet' | 'cardsCount';

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

export function getPackTotalCards(pack: GamePack): number {
  if (!pack?.cards) return 0;
  return Object.values(pack.cards).reduce(
    (sum, arr) => sum + (Array.isArray(arr) ? arr.length : 0),
    0
  );
}
