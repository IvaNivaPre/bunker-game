import { initializeApp, getApps, deleteApp, FirebaseApp } from 'firebase/app';
import {
  getDatabase,
  ref,
  set,
  get,
  onValue,
  Database,
} from 'firebase/database';
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  onSnapshot,
  Firestore,
} from 'firebase/firestore';
import {
  AISummaryData,
  ATTRIBUTE_METADATA,
  AttributeKey,
  BunkerSettings,
  FirebaseConfig,
  PlayerData,
  RoomData,
} from '../types/game';
import {
  drawSingleAttributeCard,
  generatePlayerAttributes,
} from '../data/defaultPacks';
import { getFirebaseConfig, getPackById } from './storageService';
import { generateBunkerFinale } from './geminiService';

export type SyncBackendMode = 'firebase-rtdb' | 'firebase-firestore' | 'local';

let firebaseApp: FirebaseApp | null = null;
let rtdbInstance: Database | null = null;
let firestoreInstance: Firestore | null = null;
let currentMode: SyncBackendMode = 'local';

const LOCAL_ROOMS_PREFIX = 'bunker_room_data_';
const broadcastChannel =
  typeof window !== 'undefined' && 'BroadcastChannel' in window
    ? new BroadcastChannel('bunker_online_rooms_sync')
    : null;

const localSubscribers = new Map<string, Set<(room: RoomData | null) => void>>();

if (broadcastChannel) {
  broadcastChannel.onmessage = (event) => {
    const { code, room } = event.data || {};
    if (code && localSubscribers.has(code)) {
      localSubscribers.get(code)?.forEach((cb) => cb(room));
    }
  };
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key && e.key.startsWith(LOCAL_ROOMS_PREFIX)) {
      const code = e.key.replace(LOCAL_ROOMS_PREFIX, '');
      if (localSubscribers.has(code)) {
        const room = e.newValue ? (JSON.parse(e.newValue) as RoomData) : null;
        localSubscribers.get(code)?.forEach((cb) => cb(room));
      }
    }
  });
}

function formatTimeNow(): string {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

export function initFirebaseFromStorage(): {
  mode: SyncBackendMode;
  projectId?: string;
  error?: string;
} {
  const config = getFirebaseConfig();
  if (!config || !config.apiKey || !config.projectId) {
    currentMode = 'local';
    return { mode: 'local' };
  }

  try {
    const existing = getApps();
    for (const app of existing) {
      deleteApp(app).catch(() => {});
    }

    firebaseApp = initializeApp(config);

    if (config.databaseURL) {
      rtdbInstance = getDatabase(firebaseApp);
      firestoreInstance = null;
      currentMode = 'firebase-rtdb';
    } else {
      firestoreInstance = getFirestore(firebaseApp);
      rtdbInstance = null;
      currentMode = 'firebase-firestore';
    }

    return { mode: currentMode, projectId: config.projectId };
  } catch (err) {
    console.error('Firebase initialization failed, falling back to local mode:', err);
    currentMode = 'local';
    return {
      mode: 'local',
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// Initialize on module load
initFirebaseFromStorage();

export function getSyncMode(): SyncBackendMode {
  return currentMode;
}

export async function testFirebaseConnection(
  config: FirebaseConfig
): Promise<{ ok: boolean; mode: SyncBackendMode; message: string }> {
  let testApp: FirebaseApp | null = null;
  try {
    testApp = initializeApp(config, `test_app_${Date.now()}`);
    if (config.databaseURL) {
      const db = getDatabase(testApp);
      const pingRef = ref(db, `_connection_test/ping`);
      await set(pingRef, { timestamp: Date.now(), status: 'ok' });
      const snap = await get(pingRef);
      await deleteApp(testApp);
      if (snap.exists()) {
        return {
          ok: true,
          mode: 'firebase-rtdb',
          message: `Realtime Database подключена успешно (${config.projectId})!`,
        };
      }
    } else {
      const fs = getFirestore(testApp);
      const pingDoc = doc(fs, '_connection_test', 'ping');
      await setDoc(pingDoc, { timestamp: Date.now(), status: 'ok' });
      const snap = await getDoc(pingDoc);
      await deleteApp(testApp);
      if (snap.exists()) {
        return {
          ok: true,
          mode: 'firebase-firestore',
          message: `Cloud Firestore подключен успешно (${config.projectId})! (Для Realtime DB добавьте поле databaseURL)`,
        };
      }
    }
    return {
      ok: false,
      mode: 'local',
      message: 'Не удалось подтвердить запись в базу данных.',
    };
  } catch (err) {
    if (testApp) {
      deleteApp(testApp).catch(() => {});
    }
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      mode: 'local',
      message: `Ошибка подключения Firebase: ${msg}. Проверьте правила доступа (Rules) и корректность databaseURL / projectId.`,
    };
  }
}

function sanitizeForFirebase<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

async function readRoomRaw(code: string): Promise<RoomData | null> {
  const cleanCode = code.toUpperCase().trim();
  if (currentMode === 'firebase-rtdb' && rtdbInstance) {
    const snap = await get(ref(rtdbInstance, `rooms/${cleanCode}`));
    return snap.exists() ? (snap.val() as RoomData) : null;
  }
  if (currentMode === 'firebase-firestore' && firestoreInstance) {
    const snap = await getDoc(doc(firestoreInstance, 'rooms', cleanCode));
    return snap.exists() ? (snap.data() as RoomData) : null;
  }
  // Local fallback
  const raw = localStorage.getItem(`${LOCAL_ROOMS_PREFIX}${cleanCode}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as RoomData;
  } catch {
    return null;
  }
}

async function writeRoomRaw(code: string, room: RoomData): Promise<void> {
  const cleanCode = code.toUpperCase().trim();
  const payload = sanitizeForFirebase({
    ...room,
    updatedAt: Date.now(),
  });

  // Always mirror to local storage as backup
  localStorage.setItem(`${LOCAL_ROOMS_PREFIX}${cleanCode}`, JSON.stringify(payload));
  broadcastChannel?.postMessage({ code: cleanCode, room: payload });
  localSubscribers.get(cleanCode)?.forEach((cb) => cb(payload));

  if (currentMode === 'firebase-rtdb' && rtdbInstance) {
    await set(ref(rtdbInstance, `rooms/${cleanCode}`), payload);
  } else if (currentMode === 'firebase-firestore' && firestoreInstance) {
    await setDoc(doc(firestoreInstance, 'rooms', cleanCode), payload);
  }
}

export function subscribeToRoom(
  code: string,
  onUpdate: (room: RoomData | null) => void
): () => void {
  const cleanCode = code.toUpperCase().trim();

  if (currentMode === 'firebase-rtdb' && rtdbInstance) {
    const roomRef = ref(rtdbInstance, `rooms/${cleanCode}`);
    const unsubscribe = onValue(
      roomRef,
      (snapshot) => {
        onUpdate(snapshot.exists() ? (snapshot.val() as RoomData) : null);
      },
      (error) => {
        console.error('RTDB subscription error:', error);
      }
    );
    return () => unsubscribe();
  }

  if (currentMode === 'firebase-firestore' && firestoreInstance) {
    const roomDoc = doc(firestoreInstance, 'rooms', cleanCode);
    const unsubscribe = onSnapshot(
      roomDoc,
      (snapshot) => {
        onUpdate(snapshot.exists() ? (snapshot.data() as RoomData) : null);
      },
      (error) => {
        console.error('Firestore subscription error:', error);
      }
    );
    return () => unsubscribe();
  }

  // Local mode subscription
  if (!localSubscribers.has(cleanCode)) {
    localSubscribers.set(cleanCode, new Set());
  }
  localSubscribers.get(cleanCode)!.add(onUpdate);

  // Immediately emit current value
  readRoomRaw(cleanCode).then((data) => onUpdate(data));

  return () => {
    localSubscribers.get(cleanCode)?.delete(onUpdate);
  };
}

/**
 * Generates a unique 3-character room code (uppercase Latin letters and digits, excluding ambiguous 0, O, I, 1, L)
 */
export function generateRoomCode(): string {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let result = '';
  for (let i = 0; i < 3; i++) {
    result += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
  }
  return result;
}

export async function createRoom(
  hostUid: string,
  hostName: string,
  packId?: string
): Promise<RoomData> {
  const pack = getPackById(packId);
  let code = generateRoomCode();
  for (let attempt = 0; attempt < 5; attempt++) {
    const existing = await readRoomRaw(code);
    if (!existing) break;
    code = generateRoomCode();
  }

  const presetCatastrophe = pack.catastrophes[0] || {
    title: 'Ядерная зима',
    description: 'Ядерная зима после глобального конфликта. Воздух заражён радиоактивным пеплом.',
    threats: 'Высокий уровень радиации, температура -40°C.',
  };

  const presetBunker = pack.bunkers[0] || {
    name: 'Сектор-7',
    size: 100,
    duration: '3 года',
    supplies: 'Гидропонный модуль, запас консервов на 2 года, медблок, генератор',
  };

  const hostPlayer: PlayerData = {
    uid: hostUid,
    name: hostName.trim() || 'Командор',
    isHost: true,
    isAlive: true,
    joinedAt: Date.now(),
    lastSeen: Date.now(),
    revealedInRound: 0,
    attributes: generatePlayerAttributes(pack),
  };

  const initialRoom: RoomData = {
    code,
    hostId: hostUid,
    status: 'LOBBY',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    round: 0,
    currentTurnUid: null,
    turnOrder: [hostUid],
    timerEndAt: null,
    settings: {
      capacity: 1, // Will auto-scale as players join: Math.max(1, Math.floor(count / 2))
      duration: '3 года',
      size: 100,
      supplies: presetBunker.supplies,
      catastrophe: `${presetCatastrophe.title}. ${presetCatastrophe.description}`,
      catastropheTitle: presetCatastrophe.title,
      threats: presetCatastrophe.threats,
      roundTimerSeconds: 90,
      packId: pack.id,
    },
    players: {
      [hostUid]: hostPlayer,
    },
    votes: {},
    logs: [
      `${formatTimeNow()}: Хост ${hostPlayer.name} создал бункер #${code}. Ожидание выживших у гермодверей...`,
    ],
    aiSummary: null,
  };

  await writeRoomRaw(code, initialRoom);
  return initialRoom;
}

export async function joinRoom(
  code: string,
  userUid: string,
  userName: string
): Promise<RoomData> {
  const cleanCode = code.toUpperCase().trim();
  const room = await readRoomRaw(cleanCode);
  if (!room) {
    throw new Error(`Комната с кодом «${cleanCode}» не найдена.`);
  }

  const players = room.players || {};
  const existingPlayer = players[userUid];

  if (existingPlayer) {
    // Reconnect existing player
    existingPlayer.name = userName.trim() || existingPlayer.name;
    existingPlayer.lastSeen = Date.now();
    await writeRoomRaw(cleanCode, room);
    return room;
  }

  if (room.status !== 'LOBBY') {
    throw new Error(
      'Гермодвери этого бункера уже запечатаны (игра началась). Подключение новых игроков невозможно.'
    );
  }

  const pack = getPackById(room.settings.packId);
  const newPlayer: PlayerData = {
    uid: userUid,
    name: userName.trim() || `Выживший-${Object.keys(players).length + 1}`,
    isHost: false,
    isAlive: true,
    joinedAt: Date.now(),
    lastSeen: Date.now(),
    revealedInRound: 0,
    attributes: generatePlayerAttributes(pack),
  };

  room.players[userUid] = newPlayer;
  const totalPlayers = Object.keys(room.players).length;
  room.settings.capacity = Math.max(1, Math.floor(totalPlayers / 2));
  room.logs = [
    ...(room.logs || []),
    `${formatTimeNow()}: ${newPlayer.name} прибыл ко входу в бункер (всего участников: ${totalPlayers}).`,
  ];

  await writeRoomRaw(cleanCode, room);
  return room;
}

const BOT_NAMES = [
  'Виктор (Бот)',
  'Елена (Бот)',
  'Кирилл (Бот)',
  'Мария (Бот)',
  'Артём (Бот)',
  'Ольга (Бот)',
  'Дмитрий (Бот)',
  'Светлана (Бот)',
];

export async function addBotToRoom(code: string): Promise<void> {
  const room = await readRoomRaw(code);
  if (!room || room.status !== 'LOBBY') return;

  const existingNames = new Set(Object.values(room.players).map((p) => p.name));
  const botName =
    BOT_NAMES.find((n) => !existingNames.has(n)) ||
    `Андроид-${Object.keys(room.players).length + 1}`;
  const botUid = `bot_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const pack = getPackById(room.settings.packId);

  room.players[botUid] = {
    uid: botUid,
    name: botName,
    isHost: false,
    isAlive: true,
    isBot: true,
    joinedAt: Date.now(),
    lastSeen: Date.now(),
    revealedInRound: 0,
    attributes: generatePlayerAttributes(pack),
  };

  const totalPlayers = Object.keys(room.players).length;
  room.settings.capacity = Math.max(1, Math.floor(totalPlayers / 2));
  room.logs = [
    ...(room.logs || []),
    `${formatTimeNow()}: Добавлен тестовый участник ${botName} (вместимость бункера: ${room.settings.capacity}).`,
  ];

  await writeRoomRaw(code, room);
}

export async function updateBunkerSettings(
  code: string,
  partialSettings: Partial<BunkerSettings>
): Promise<void> {
  const room = await readRoomRaw(code);
  if (!room) return;

  room.settings = {
    ...room.settings,
    ...partialSettings,
  };

  await writeRoomRaw(code, room);
}

export async function startGame(code: string): Promise<void> {
  const room = await readRoomRaw(code);
  if (!room) return;

  const pack = getPackById(room.settings.packId);
  const usedTracker: Record<AttributeKey, Set<string>> = {
    profession: new Set(),
    gender: new Set(),
    health: new Set(),
    physique: new Set(),
    hobby: new Set(),
    trait: new Set(),
    phobia: new Set(),
    inventory: new Set(),
    backpack: new Set(),
    extra: new Set(),
    specialCard: new Set(),
  };

  const playerUids = Object.keys(room.players);
  if (playerUids.length < 2) {
    throw new Error('Для старта игры нужно минимум 2 участника (вы можете добавить ботов для теста).');
  }

  for (const uid of playerUids) {
    room.players[uid].isAlive = true;
    room.players[uid].revealedInRound = 0;
    room.players[uid].voteModifiers = {};
    room.players[uid].attributes = generatePlayerAttributes(pack, usedTracker);
  }

  // Ensure capacity is sensible (at least 1 and less than totalPlayers)
  const cap = Math.max(
    1,
    Math.min(playerUids.length - 1, Number(room.settings.capacity) || Math.floor(playerUids.length / 2))
  );
  room.settings.capacity = cap;

  room.status = 'PLAYING';
  room.round = 1;
  room.turnOrder = playerUids;
  room.currentTurnUid = playerUids[0];
  room.votes = {};
  room.tiedCandidates = [];
  room.aiSummary = null;
  room.timerEndAt =
    room.settings.roundTimerSeconds > 0
      ? Date.now() + room.settings.roundTimerSeconds * 1000
      : null;

  room.logs = [
    ...(room.logs || []),
    `${formatTimeNow()}: === СИРЕНА ТРЕВОГИ! ИГРА НАЧАЛАСЬ (Раунд 1) ===`,
    `${formatTimeNow()}: Мест в бункере: ${cap} из ${playerUids.length}. Первым открывает характеристику: ${
      room.players[playerUids[0]]?.name
    }.`,
  ];

  await writeRoomRaw(code, room);
  await triggerBotMovesIfNeeded(code);
}

export async function revealAttribute(
  code: string,
  playerUid: string,
  attrKey: AttributeKey
): Promise<void> {
  const room = await readRoomRaw(code);
  if (!room) return;

  const player = room.players[playerUid];
  if (!player || !player.isAlive) return;

  const card = player.attributes[attrKey];
  if (!card || card.revealed) return;

  card.revealed = true;
  player.revealedInRound = (player.revealedInRound || 0) + 1;

  const meta = ATTRIBUTE_METADATA.find((m) => m.key === attrKey);
  const label = meta ? meta.label.toLowerCase() : attrKey;

  room.logs = [
    ...(room.logs || []),
    `${formatTimeNow()}: ${player.name} открыл характеристику «${meta?.label || label}»: ${card.text}`,
  ];

  // If it was this player's turn, automatically move turn pointer to next alive player who hasn't revealed in this round
  const aliveOrder = (room.turnOrder || Object.keys(room.players)).filter(
    (uid) => room.players[uid]?.isAlive
  );
  if (room.currentTurnUid === playerUid && aliveOrder.length > 0) {
    const idx = aliveOrder.indexOf(playerUid);
    const nextCandidate = aliveOrder
      .slice(idx + 1)
      .concat(aliveOrder.slice(0, idx + 1))
      .find((uid) => (room.players[uid]?.revealedInRound || 0) < 1);
    room.currentTurnUid = nextCandidate || aliveOrder[(idx + 1) % aliveOrder.length];
  }

  await writeRoomRaw(code, room);
  await triggerBotMovesIfNeeded(code);
}

export async function activateAbility(
  code: string,
  actorUid: string,
  sourceKey: 'profession' | 'hobby' | 'specialCard',
  targetPlayerUid?: string,
  targetAttributeKey?: AttributeKey
): Promise<void> {
  const room = await readRoomRaw(code);
  if (!room) return;

  const actor = room.players[actorUid];
  if (!actor || !actor.isAlive) {
    throw new Error('Только живой участник в бункере может применить способность.');
  }

  const sourceCard = actor.attributes[sourceKey];
  if (!sourceCard || !sourceCard.ability) {
    throw new Error('У этой карты нет активной спец. способности.');
  }

  if (sourceKey !== 'specialCard' && !sourceCard.revealed) {
    throw new Error('Сначала вскройте эту карту для всех, чтобы активировать её способность!');
  }

  if (sourceCard.ability.used) {
    throw new Error('Эта способность уже была использована.');
  }

  // Mark specialCard itself as revealed when used
  sourceCard.revealed = true;
  sourceCard.ability.used = true;

  const ability = sourceCard.ability;
  const targetPlayer =
    (targetPlayerUid && room.players[targetPlayerUid]) || actor;
  const pack = getPackById(room.settings.packId);
  let effectLog = '';

  switch (ability.effectType) {
    case 'heal_player': {
      targetPlayer.attributes.health = {
        ...targetPlayer.attributes.health,
        text: 'Идеальное (полностью вылечен в бункере)',
        revealed: true,
        rarity: 'epic',
      };
      effectLog = `${actor.name} применил «${ability.name}» и полностью вылечил игрока ${targetPlayer.name}!`;
      break;
    }

    case 'cure_phobia': {
      targetPlayer.attributes.phobia = {
        ...targetPlayer.attributes.phobia,
        text: 'Отсутствует (фобия преодолена с помощью терапии)',
        revealed: true,
        rarity: 'epic',
      };
      effectLog = `${actor.name} применил «${ability.name}» и избавил ${targetPlayer.name} от фобии!`;
      break;
    }

    case 'force_reveal': {
      const hiddenKeys = ATTRIBUTE_METADATA.map((m) => m.key).filter(
        (k) => k !== 'specialCard' && !targetPlayer.attributes[k]?.revealed
      );
      if (hiddenKeys.length > 0) {
        const chosenKey =
          targetAttributeKey && hiddenKeys.includes(targetAttributeKey)
            ? targetAttributeKey
            : hiddenKeys[Math.floor(Math.random() * hiddenKeys.length)];
        targetPlayer.attributes[chosenKey].revealed = true;
        const meta = ATTRIBUTE_METADATA.find((m) => m.key === chosenKey);
        effectLog = `${actor.name} применил «${ability.name}» на ${targetPlayer.name} — принудительно вскрыта карта «${
          meta?.label
        }»: ${targetPlayer.attributes[chosenKey].text}!`;
      } else {
        effectLog = `${actor.name} применил «${ability.name}» на ${targetPlayer.name}, но все карты цели уже открыты.`;
      }
      break;
    }

    case 'reroll_attribute': {
      const attrToReroll: AttributeKey =
        targetAttributeKey ||
        (ability.targetValue as AttributeKey) ||
        'health';
      const existingTexts = Object.values(room.players).map(
        (p) => p.attributes[attrToReroll]?.text || ''
      );
      const newCard = drawSingleAttributeCard(pack, attrToReroll, existingTexts);
      targetPlayer.attributes[attrToReroll] = newCard;
      const meta = ATTRIBUTE_METADATA.find((m) => m.key === attrToReroll);
      effectLog = `${actor.name} применил «${ability.name}»: у игрока ${targetPlayer.name} заменена карта «${
        meta?.label
      }» на «${newCard.text}»!`;
      break;
    }

    case 'swap_inventory': {
      const temp = { ...actor.attributes.inventory };
      actor.attributes.inventory = {
        ...targetPlayer.attributes.inventory,
        revealed: true,
      };
      targetPlayer.attributes.inventory = {
        ...temp,
        revealed: true,
      };
      effectLog = `${actor.name} применил «${ability.name}» и обменялся крупным инвентарём с игроком ${targetPlayer.name}!`;
      break;
    }

    case 'swap_backpack': {
      const temp = { ...actor.attributes.backpack };
      actor.attributes.backpack = {
        ...targetPlayer.attributes.backpack,
        revealed: true,
      };
      targetPlayer.attributes.backpack = {
        ...temp,
        revealed: true,
      };
      effectLog = `${actor.name} применил «${ability.name}» и обменялся рюкзаком с игроком ${targetPlayer.name}!`;
      break;
    }

    case 'shield_vote': {
      actor.voteModifiers = {
        ...(actor.voteModifiers || {}),
        shielded: true,
      };
      effectLog = `${actor.name} активировал способность «${ability.name}»: защита (-1 голос против себя) на голосовании!`;
      break;
    }

    case 'double_vote': {
      actor.voteModifiers = {
        ...(actor.voteModifiers || {}),
        doubleVote: true,
      };
      effectLog = `${actor.name} активировал способность «${ability.name}»: его голос на трибунале считается за два!`;
      break;
    }

    case 'block_vote': {
      targetPlayer.voteModifiers = {
        ...(targetPlayer.voteModifiers || {}),
        voteBlocked: true,
      };
      if (room.votes && room.votes[targetPlayer.uid]) {
        delete room.votes[targetPlayer.uid];
      }
      effectLog = `${actor.name} применил «${ability.name}» и лишил игрока ${targetPlayer.name} права голоса в текущем раунде!`;
      break;
    }

    case 'bunker_upgrade': {
      const upgradeText =
        ability.targetValue || 'Модернизированный модуль жизнеобеспечения';
      if (!room.settings.supplies.includes(upgradeText)) {
        room.settings.supplies = `${room.settings.supplies}; [МОДЕРНИЗАЦИЯ от ${actor.name}]: ${upgradeText}`;
      }
      effectLog = `${actor.name} применил «${ability.name}» — оснащение бункера улучшено: ${upgradeText}!`;
      break;
    }

    case 'world_intel': {
      const intelText =
        ability.targetValue ||
        'Получены разведданные о безопасном секторе в 5 км от убежища.';
      if (!room.settings.catastrophe.includes(intelText)) {
        room.settings.catastrophe = `${room.settings.catastrophe} [${intelText}]`;
      }
      effectLog = `${actor.name} применил «${ability.name}» и добыл разведданные о внешнем мире!`;
      break;
    }

    default: {
      effectLog = `${actor.name} активировал способность «${ability.name}» (${ability.description}).`;
    }
  }

  room.logs = [...(room.logs || []), `${formatTimeNow()}: ⚡ ${effectLog}`];
  await writeRoomRaw(code, room);
}

export async function advanceTurn(code: string): Promise<void> {
  const room = await readRoomRaw(code);
  if (!room) return;

  const aliveOrder = (room.turnOrder || Object.keys(room.players)).filter(
    (uid) => room.players[uid]?.isAlive
  );
  if (aliveOrder.length === 0) return;

  const currentIdx = room.currentTurnUid ? aliveOrder.indexOf(room.currentTurnUid) : -1;
  const nextUid = aliveOrder[(currentIdx + 1) % aliveOrder.length];
  room.currentTurnUid = nextUid;
  if (room.settings.roundTimerSeconds > 0) {
    room.timerEndAt = Date.now() + room.settings.roundTimerSeconds * 1000;
  }

  await writeRoomRaw(code, room);
  await triggerBotMovesIfNeeded(code);
}

export async function resetOrSetTimer(
  code: string,
  seconds: number | null
): Promise<void> {
  const room = await readRoomRaw(code);
  if (!room) return;

  room.timerEndAt = seconds && seconds > 0 ? Date.now() + seconds * 1000 : null;
  await writeRoomRaw(code, room);
}

export async function startVoting(code: string): Promise<void> {
  const room = await readRoomRaw(code);
  if (!room) return;

  room.status = 'VOTING';
  room.votes = {};
  room.tiedCandidates = [];
  room.lastVoteTally = {};
  room.timerEndAt = Date.now() + 60 * 1000; // 60 sec for voting
  room.logs = [
    ...(room.logs || []),
    `${formatTimeNow()}: ⚖️ Запущено тайное голосование за изгнание (Раунд ${room.round}).`,
  ];

  await writeRoomRaw(code, room);
  await triggerBotMovesIfNeeded(code);
}

export async function castVote(
  code: string,
  voterUid: string,
  targetUid: string
): Promise<void> {
  const room = await readRoomRaw(code);
  if (!room) return;
  if (room.status !== 'VOTING' && room.status !== 'REVOTE') return;

  const voter = room.players[voterUid];
  const target = room.players[targetUid];
  if (!voter || !voter.isAlive || !target || !target.isAlive) return;

  if (voter.voteModifiers?.voteBlocked) {
    throw new Error('Ваше право голоса заблокировано спец. способностью в этом раунде.');
  }

  if (
    room.status === 'REVOTE' &&
    room.tiedCandidates &&
    room.tiedCandidates.length > 0 &&
    !room.tiedCandidates.includes(targetUid)
  ) {
    throw new Error('В повторном голосовании можно голосовать только против кандидатов из списка ничьей.');
  }

  room.votes = room.votes || {};
  room.votes[voterUid] = targetUid;

  await writeRoomRaw(code, room);
}

export async function startRevoteAfterDefense(code: string): Promise<void> {
  const room = await readRoomRaw(code);
  if (!room) return;

  room.status = 'REVOTE';
  room.votes = {};
  room.timerEndAt = Date.now() + 45 * 1000;
  const candidateNames = (room.tiedCandidates || [])
    .map((uid) => room.players[uid]?.name)
    .filter(Boolean)
    .join(', ');

  room.logs = [
    ...(room.logs || []),
    `${formatTimeNow()}: ⚖️ Оправдательные речи завершены. Повторное голосование между лидерами антирейтинга: ${candidateNames}.`,
  ];

  await writeRoomRaw(code, room);
  await triggerBotMovesIfNeeded(code);
}

export async function finalizeVoting(
  code: string,
  tieBreakDecision?: 'random' | 'skip'
): Promise<void> {
  const room = await readRoomRaw(code);
  if (!room) return;

  const votes = room.votes || {};
  const tally: Record<string, number> = {};

  for (const [voterUid, targetUid] of Object.entries(votes)) {
    const voter = room.players[voterUid];
    const target = room.players[targetUid];
    if (!voter?.isAlive || !target?.isAlive) continue;
    if (voter.voteModifiers?.voteBlocked) continue;

    const weight = voter.voteModifiers?.doubleVote ? 2 : 1;
    tally[targetUid] = (tally[targetUid] || 0) + weight;
  }

  // Apply shield modifier (-1 vote against shielded players)
  for (const uid of Object.keys(tally)) {
    if (room.players[uid]?.voteModifiers?.shielded) {
      tally[uid] = Math.max(0, tally[uid] - 1);
    }
  }

  room.lastVoteTally = tally;

  let maxVotes = 0;
  for (const count of Object.values(tally)) {
    if (count > maxVotes) maxVotes = count;
  }

  const leaders = Object.keys(tally).filter((uid) => tally[uid] === maxVotes && maxVotes > 0);

  // No votes cast at all
  if (leaders.length === 0) {
    room.status = 'PLAYING';
    room.round = (room.round || 1) + 1;
    room.logs = [
      ...(room.logs || []),
      `${formatTimeNow()}: Голосование завершилось без единого голоса. Никто не изгнан. Начинается Раунд ${room.round}.`,
    ];
    resetRoundStateForPlayers(room);
    await writeRoomRaw(code, room);
    await triggerBotMovesIfNeeded(code);
    return;
  }

  // Tie detected on primary VOTING -> Enter 30-second TIE_DEFENSE speech phase!
  if (leaders.length > 1 && room.status === 'VOTING') {
    room.status = 'TIE_DEFENSE';
    room.tiedCandidates = leaders;
    room.timerEndAt = Date.now() + 30 * 1000; // 30 seconds defense speech per spec!
    const tiedNames = leaders.map((id) => room.players[id]?.name).join(' и ');
    room.logs = [
      ...(room.logs || []),
      `${formatTimeNow()}: ⚠️ НИЧЬЯ НА ГОЛОСОВАНИИ (${maxVotes} гол.) между: ${tiedNames}! Объявляется фаза оправдательных речей (30 секунд).`,
    ];
    await writeRoomRaw(code, room);
    return;
  }

  // If still tied in REVOTE
  let exiledUid = leaders[0];
  if (leaders.length > 1 && room.status === 'REVOTE') {
    if (tieBreakDecision === 'skip') {
      room.status = 'PLAYING';
      room.round = (room.round || 1) + 1;
      room.tiedCandidates = [];
      room.votes = {};
      resetRoundStateForPlayers(room);
      room.logs = [
        ...(room.logs || []),
        `${formatTimeNow()}: Повторное голосование снова дало ничью. По решению бункера в этом раунде никто не изгнан. Раунд ${room.round}.`,
      ];
      await writeRoomRaw(code, room);
      await triggerBotMovesIfNeeded(code);
      return;
    } else {
      // Random draw among tied leaders
      exiledUid = leaders[Math.floor(Math.random() * leaders.length)];
    }
  }

  // Exile the chosen candidate
  const exiledPlayer = room.players[exiledUid];
  if (exiledPlayer) {
    exiledPlayer.isAlive = false;
    room.logs = [
      ...(room.logs || []),
      `${formatTimeNow()}: 🚪 Игрок ${exiledPlayer.name} изгнан из бункера большинством голосов (${maxVotes} гол.) и переходит в статус «Наблюдатель».`,
    ];
  }

  room.votes = {};
  room.tiedCandidates = [];

  const alivePlayers = Object.values(room.players).filter((p) => p.isAlive);
  if (alivePlayers.length <= room.settings.capacity) {
    // Transition to FINALE!
    room.status = 'FINALE';
    room.timerEndAt = null;
    room.logs = [
      ...(room.logs || []),
      `${formatTimeNow()}: 🔒 Число выживших (${alivePlayers.length}) сравнялось с вместимостью бункера (${room.settings.capacity}). ГЕРМОДВЕРИ ЗАПЕЧАТАНЫ! Запуск финального ИИ-анализа...`,
    ];
    await writeRoomRaw(code, room);

    // Generate AI summary and store in room
    try {
      const summary = await generateBunkerFinale(room);
      const latestRoom = (await readRoomRaw(code)) || room;
      latestRoom.aiSummary = summary;
      await writeRoomRaw(code, latestRoom);
    } catch (err) {
      console.error('Failed to generate finale summary:', err);
    }
    return;
  }

  // Otherwise advance to next round of PLAYING
  room.status = 'PLAYING';
  room.round = (room.round || 1) + 1;
  resetRoundStateForPlayers(room);
  room.logs = [
    ...(room.logs || []),
    `${formatTimeNow()}: Начинается Раунд ${room.round}. Осталось выживших: ${
      alivePlayers.length
    } (мест в бункере: ${room.settings.capacity}).`,
  ];

  await writeRoomRaw(code, room);
  await triggerBotMovesIfNeeded(code);
}

function resetRoundStateForPlayers(room: RoomData) {
  const aliveOrder = (room.turnOrder || Object.keys(room.players)).filter(
    (uid) => room.players[uid]?.isAlive
  );
  for (const p of Object.values(room.players)) {
    p.revealedInRound = 0;
    p.voteModifiers = {};
  }
  room.currentTurnUid = aliveOrder[0] || null;
  room.timerEndAt =
    room.settings.roundTimerSeconds > 0
      ? Date.now() + room.settings.roundTimerSeconds * 1000
      : null;
}

export async function regenerateRoomFinale(
  code: string,
  customSummary?: AISummaryData
): Promise<AISummaryData | null> {
  const room = await readRoomRaw(code);
  if (!room) return null;

  room.status = 'FINALE';
  const summary = customSummary || (await generateBunkerFinale(room));
  room.aiSummary = summary;
  room.logs = [
    ...(room.logs || []),
    `${formatTimeNow()}: 🤖 Бортовой ИИ сформировал эпилог выживания колонии (${summary.survivalProbability}%).`,
  ];
  await writeRoomRaw(code, room);
  return summary;
}

export async function transferHost(code: string, newHostUid: string): Promise<void> {
  const room = await readRoomRaw(code);
  if (!room || !room.players[newHostUid]) return;

  for (const p of Object.values(room.players)) {
    p.isHost = p.uid === newHostUid;
  }
  room.hostId = newHostUid;
  room.logs = [
    ...(room.logs || []),
    `${formatTimeNow()}: 👑 Права Хоста комнаты переданы игроку ${room.players[newHostUid].name}.`,
  ];

  await writeRoomRaw(code, room);
}

export async function removeOrLeavePlayer(
  code: string,
  targetUid: string
): Promise<void> {
  const room = await readRoomRaw(code);
  if (!room || !room.players[targetUid]) return;

  const leavingName = room.players[targetUid].name;
  const wasHost = room.hostId === targetUid || room.players[targetUid].isHost;

  if (room.status === 'LOBBY') {
    delete room.players[targetUid];
    const remaining = Object.values(room.players);
    if (remaining.length === 0) {
      return;
    }
    room.settings.capacity = Math.max(1, Math.floor(remaining.length / 2));
  } else {
    // During an active game, mark player as exiled/spectator so turn/voting isn't blocked
    room.players[targetUid].isAlive = false;
    room.players[targetUid].isHost = false;
  }

  const remainingPlayers = Object.values(room.players);
  if (wasHost && remainingPlayers.length > 0) {
    const nextHost =
      remainingPlayers.find((p) => p.uid !== targetUid && !p.isBot && p.isAlive) ||
      remainingPlayers.find((p) => p.uid !== targetUid && !p.isBot) ||
      remainingPlayers[0];
    if (nextHost) {
      room.hostId = nextHost.uid;
      nextHost.isHost = true;
      room.logs = [
        ...(room.logs || []),
        `${formatTimeNow()}: 👑 Хост ${leavingName} покинул пост. Новым Хостом назначен ${nextHost.name}.`,
      ];
    }
  } else {
    room.logs = [
      ...(room.logs || []),
      `${formatTimeNow()}: Участник ${leavingName} покинул бункер.`,
    ];
  }

  await writeRoomRaw(code, room);
}

export async function addLogMessage(
  code: string,
  authorName: string,
  text: string
): Promise<void> {
  const room = await readRoomRaw(code);
  if (!room || !text.trim()) return;

  room.logs = [
    ...(room.logs || []),
    `${formatTimeNow()}: 💬 [${authorName}]: ${text.trim()}`,
  ];
  await writeRoomRaw(code, room);
}

export async function backToLobby(code: string): Promise<void> {
  const room = await readRoomRaw(code);
  if (!room) return;

  room.status = 'LOBBY';
  room.round = 0;
  room.votes = {};
  room.tiedCandidates = [];
  room.aiSummary = null;
  for (const p of Object.values(room.players)) {
    p.isAlive = true;
    p.revealedInRound = 0;
    p.voteModifiers = {};
  }
  room.logs = [
    ...(room.logs || []),
    `${formatTimeNow()}: 🔄 Комната возвращена в режим Лобби для новой партии.`,
  ];
  await writeRoomRaw(code, room);
}

/**
 * Automates bot actions (revealing 1 card per round and casting votes) so solo/small-group games work smoothly
 */
async function triggerBotMovesIfNeeded(code: string): Promise<void> {
  const room = await readRoomRaw(code);
  if (!room) return;

  let changed = false;

  if (room.status === 'PLAYING') {
    for (const player of Object.values(room.players)) {
      if (player.isBot && player.isAlive && (player.revealedInRound || 0) < 1) {
        // In round 1 bots prefer revealing profession first, then random unrevealed
        const unrevealedKeys = ATTRIBUTE_METADATA.map((m) => m.key).filter(
          (k) => k !== 'specialCard' && !player.attributes[k]?.revealed
        );
        if (unrevealedKeys.length > 0) {
          const chosenKey =
            room.round === 1 && !player.attributes.profession.revealed
              ? 'profession'
              : unrevealedKeys[Math.floor(Math.random() * unrevealedKeys.length)];
          player.attributes[chosenKey].revealed = true;
          player.revealedInRound = 1;
          const meta = ATTRIBUTE_METADATA.find((m) => m.key === chosenKey);
          room.logs = [
            ...(room.logs || []),
            `${formatTimeNow()}: ${player.name} открыл характеристику «${meta?.label}»: ${
              player.attributes[chosenKey].text
            }`,
          ];
          changed = true;
        }
      }
    }
  } else if (room.status === 'VOTING' || room.status === 'REVOTE') {
    const aliveTargets = Object.values(room.players).filter((p) => p.isAlive);
    const validTargets =
      room.status === 'REVOTE' && room.tiedCandidates && room.tiedCandidates.length > 0
        ? aliveTargets.filter((p) => room.tiedCandidates!.includes(p.uid))
        : aliveTargets;

    room.votes = room.votes || {};
    for (const player of Object.values(room.players)) {
      if (
        player.isBot &&
        player.isAlive &&
        !player.voteModifiers?.voteBlocked &&
        !room.votes[player.uid]
      ) {
        const candidates = validTargets.filter((t) => t.uid !== player.uid);
        const pool = candidates.length > 0 ? candidates : validTargets;
        if (pool.length > 0) {
          const pick = pool[Math.floor(Math.random() * pool.length)];
          room.votes[player.uid] = pick.uid;
          changed = true;
        }
      }
    }
  }

  if (changed) {
    await writeRoomRaw(code, room);
  }
}

