import { initializeApp, getApps, deleteApp, FirebaseApp } from 'firebase/app';
import {
  getDatabase,
  ref,
  set,
  get,
  remove,
  onValue,
  Database,
} from 'firebase/database';
import {
  getFirestore,
  doc,
  collection,
  getDocs,
  setDoc,
  getDoc,
  deleteDoc,
  onSnapshot,
  Firestore,
} from 'firebase/firestore';
import {
  ATTRIBUTE_METADATA,
  AttributeKey,
  BunkerSettings,
  FirebaseConfig,
  GamePack,
  PlayerData,
  RoomData,
} from '../types/game';
import {
  drawSingleAttributeCardFromPacks,
  generatePlayerAttributesFromPacks,
} from '../data/defaultPacks';
import {
  getAllBunkerPresets,
  getAllCatastrophePresets,
  getFirebaseConfig,
  getPacksByIds,
} from './storageService';

export type SyncBackendMode = 'firebase-rtdb' | 'firebase-firestore' | 'local';

let firebaseApp: FirebaseApp | null = null;
let rtdbInstance: Database | null = null;
let firestoreInstance: Firestore | null = null;
let currentMode: SyncBackendMode = 'local';

const LOCAL_ROOMS_PREFIX = 'bunker_room_data_';
const STALE_ROOM_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

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

export function normalizeRoomCode(code: string): string {
  return (code || '').trim().replace(/\s+/g, '').toUpperCase();
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
    cleanupStaleRooms().catch(() => {});
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

    // Automatically clean up rooms inactive for >24h
    cleanupStaleRooms().catch(() => {});

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
          message: `Cloud Firestore подключен успешно (${config.projectId})!`,
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

function readLocalRoom(cleanCode: string): RoomData | null {
  const raw = localStorage.getItem(`${LOCAL_ROOMS_PREFIX}${cleanCode}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as RoomData;
  } catch {
    return null;
  }
}

/**
 * Safely reads room data from Firebase (`rooms/${roomCode}`) with graceful 404 / null handling
 * and local fallback so joining by code never triggers false crashes.
 */
async function readRoomRaw(code: string): Promise<RoomData | null> {
  const cleanCode = normalizeRoomCode(code);
  if (!cleanCode) return null;

  if (currentMode === 'firebase-rtdb' && rtdbInstance) {
    try {
      const snap = await get(ref(rtdbInstance, `rooms/${cleanCode}`));
      if (snap.exists()) {
        return snap.val() as RoomData;
      }
    } catch (err) {
      console.warn(`RTDB read for rooms/${cleanCode} failed, checking local fallback:`, err);
    }
  }

  if (currentMode === 'firebase-firestore' && firestoreInstance) {
    try {
      const snap = await getDoc(doc(firestoreInstance, 'rooms', cleanCode));
      if (snap.exists()) {
        return snap.data() as RoomData;
      }
    } catch (err) {
      console.warn(`Firestore read for rooms/${cleanCode} failed, checking local fallback:`, err);
    }
  }

  return readLocalRoom(cleanCode);
}

async function writeRoomRaw(code: string, room: RoomData): Promise<void> {
  const cleanCode = normalizeRoomCode(code);
  const payload = sanitizeForFirebase({
    ...room,
    code: cleanCode,
    updatedAt: Date.now(),
  });

  localStorage.setItem(`${LOCAL_ROOMS_PREFIX}${cleanCode}`, JSON.stringify(payload));
  broadcastChannel?.postMessage({ code: cleanCode, room: payload });
  localSubscribers.get(cleanCode)?.forEach((cb) => cb(payload));

  if (currentMode === 'firebase-rtdb' && rtdbInstance) {
    await set(ref(rtdbInstance, `rooms/${cleanCode}`), payload);
  } else if (currentMode === 'firebase-firestore' && firestoreInstance) {
    await setDoc(doc(firestoreInstance, 'rooms', cleanCode), payload);
  }
}

/**
 * Completely deletes a room from Firebase and localStorage (on game end or Admin termination)
 */
export async function deleteRoomCompletely(code: string): Promise<void> {
  const cleanCode = normalizeRoomCode(code);
  if (!cleanCode) return;

  localStorage.removeItem(`${LOCAL_ROOMS_PREFIX}${cleanCode}`);
  broadcastChannel?.postMessage({ code: cleanCode, room: null });
  localSubscribers.get(cleanCode)?.forEach((cb) => cb(null));

  if (currentMode === 'firebase-rtdb' && rtdbInstance) {
    try {
      await remove(ref(rtdbInstance, `rooms/${cleanCode}`));
    } catch (err) {
      console.warn('Error removing room from RTDB:', err);
    }
  } else if (currentMode === 'firebase-firestore' && firestoreInstance) {
    try {
      await deleteDoc(doc(firestoreInstance, 'rooms', cleanCode));
    } catch (err) {
      console.warn('Error removing room from Firestore:', err);
    }
  }
}

/**
 * Lists all active rooms across Firebase and localStorage
 */
export async function listAllActiveRooms(): Promise<RoomData[]> {
  const roomsMap = new Map<string, RoomData>();

  // 1. Collect from localStorage
  if (typeof window !== 'undefined') {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(LOCAL_ROOMS_PREFIX)) {
        try {
          const val = JSON.parse(localStorage.getItem(k) || '') as RoomData;
          if (val && val.code) {
            roomsMap.set(normalizeRoomCode(val.code), val);
          }
        } catch {
          // ignore
        }
      }
    }
  }

  // 2. Collect from Firebase
  if (currentMode === 'firebase-rtdb' && rtdbInstance) {
    try {
      const snap = await get(ref(rtdbInstance, 'rooms'));
      if (snap.exists()) {
        const data = snap.val() as Record<string, RoomData>;
        for (const [code, room] of Object.entries(data)) {
          if (room && room.code) {
            roomsMap.set(normalizeRoomCode(code), room);
          }
        }
      }
    } catch (err) {
      console.warn('Could not list RTDB rooms:', err);
    }
  } else if (currentMode === 'firebase-firestore' && firestoreInstance) {
    try {
      const snap = await getDocs(collection(firestoreInstance, 'rooms'));
      snap.forEach((docSnap) => {
        const room = docSnap.data() as RoomData;
        if (room && room.code) {
          roomsMap.set(normalizeRoomCode(room.code), room);
        }
      });
    } catch (err) {
      console.warn('Could not list Firestore rooms:', err);
    }
  }

  return Array.from(roomsMap.values()).sort(
    (a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0)
  );
}

/**
 * Automatically deletes rooms that have had no updates for more than 24 hours
 */
export async function cleanupStaleRooms(
  maxAgeMs: number = STALE_ROOM_TTL_MS
): Promise<number> {
  const allRooms = await listAllActiveRooms();
  const now = Date.now();
  let deletedCount = 0;

  for (const room of allRooms) {
    const lastActive = room.updatedAt || room.createdAt || 0;
    if (now - lastActive > maxAgeMs) {
      await deleteRoomCompletely(room.code);
      deletedCount++;
    }
  }
  return deletedCount;
}

export function subscribeToRoom(
  code: string,
  onUpdate: (room: RoomData | null) => void
): () => void {
  const cleanCode = normalizeRoomCode(code);

  if (currentMode === 'firebase-rtdb' && rtdbInstance) {
    const roomRef = ref(rtdbInstance, `rooms/${cleanCode}`);
    const unsubscribe = onValue(
      roomRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const val = snapshot.val() as RoomData;
          localStorage.setItem(`${LOCAL_ROOMS_PREFIX}${cleanCode}`, JSON.stringify(val));
          onUpdate(val);
        } else {
          onUpdate(null);
        }
      },
      (error) => {
        console.error('RTDB subscription error:', error);
        onUpdate(readLocalRoom(cleanCode));
      }
    );
    return () => unsubscribe();
  }

  if (currentMode === 'firebase-firestore' && firestoreInstance) {
    const roomDoc = doc(firestoreInstance, 'rooms', cleanCode);
    const unsubscribe = onSnapshot(
      roomDoc,
      (snapshot) => {
        if (snapshot.exists()) {
          const val = snapshot.data() as RoomData;
          localStorage.setItem(`${LOCAL_ROOMS_PREFIX}${cleanCode}`, JSON.stringify(val));
          onUpdate(val);
        } else {
          onUpdate(null);
        }
      },
      (error) => {
        console.error('Firestore subscription error:', error);
        onUpdate(readLocalRoom(cleanCode));
      }
    );
    return () => unsubscribe();
  }

  // Local mode subscription
  if (!localSubscribers.has(cleanCode)) {
    localSubscribers.set(cleanCode, new Set());
  }
  localSubscribers.get(cleanCode)!.add(onUpdate);

  readRoomRaw(cleanCode).then((data) => onUpdate(data));

  return () => {
    localSubscribers.get(cleanCode)?.delete(onUpdate);
  };
}

export function generateRoomCode(): string {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let result = '';
  for (let i = 0; i < 3; i++) {
    result += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
  }
  return result;
}

function getRoomSelectedPacks(room: RoomData): GamePack[] {
  const ids =
    room.settings?.packIds && room.settings.packIds.length > 0
      ? room.settings.packIds
      : room.settings?.packId
      ? [room.settings.packId]
      : undefined;
  return getPacksByIds(ids);
}

export async function createRoom(
  hostUid: string,
  hostName: string,
  packIds?: string[]
): Promise<RoomData> {
  const selectedPacks = getPacksByIds(packIds);
  const resolvedPackIds = selectedPacks.map((p) => p.id);
  const resolvedPackNames = selectedPacks.map((p) => p.name);

  let code = generateRoomCode();
  for (let attempt = 0; attempt < 5; attempt++) {
    const existing = await readRoomRaw(code);
    if (!existing) break;
    code = generateRoomCode();
  }

  const allCatastrophes = getAllCatastrophePresets();
  const allBunkers = getAllBunkerPresets();

  const presetCatastrophe = allCatastrophes[0] || {
    title: 'Ядерная зима',
    description: 'Ядерная зима после глобального конфликта. Воздух заражён радиоактивным пеплом.',
    threats: 'Высокий уровень радиации, температура -40°C.',
  };

  const presetBunker = allBunkers[0] || {
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
    attributes: generatePlayerAttributesFromPacks(selectedPacks),
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
      capacity: 1,
      duration: presetBunker.duration || '3 года',
      size: presetBunker.size || 100,
      supplies: presetBunker.supplies,
      catastrophe: `${presetCatastrophe.title}. ${presetCatastrophe.description}`,
      catastropheTitle: presetCatastrophe.title,
      threats: presetCatastrophe.threats,
      roundTimerSeconds: 90,
      packIds: resolvedPackIds,
      packNames: resolvedPackNames,
      packId: resolvedPackIds[0],
    },
    players: {
      [hostUid]: hostPlayer,
    },
    votes: {},
    lastExileResult: null,
    logs: [
      `${formatTimeNow()}: Хост ${hostPlayer.name} создал бункер #${code}. Набор паков: ${resolvedPackNames.join(', ')}.`,
    ],
  };

  await writeRoomRaw(code, initialRoom);
  return initialRoom;
}

export async function joinRoom(
  code: string,
  userUid: string,
  userName: string
): Promise<RoomData> {
  const cleanCode = normalizeRoomCode(code);
  if (!cleanCode || cleanCode.length !== 3) {
    throw new Error('Введите корректный 3-значный код комнаты (например: 7A2).');
  }

  const room = await readRoomRaw(cleanCode);
  if (!room) {
    throw new Error(
      `Комната с кодом «${cleanCode}» не найдена (404). Проверьте правильность кода или настройки Firebase.`
    );
  }

  const players = room.players || {};
  const existingPlayer = players[userUid];

  if (existingPlayer) {
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

  const selectedPacks = getRoomSelectedPacks(room);
  const newPlayer: PlayerData = {
    uid: userUid,
    name: userName.trim() || `Выживший-${Object.keys(players).length + 1}`,
    isHost: false,
    isAlive: true,
    joinedAt: Date.now(),
    lastSeen: Date.now(),
    revealedInRound: 0,
    attributes: generatePlayerAttributesFromPacks(selectedPacks),
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
  'Виктор (Авто)',
  'Елена (Авто)',
  'Кирилл (Авто)',
  'Мария (Авто)',
  'Артём (Авто)',
  'Ольга (Авто)',
  'Дмитрий (Авто)',
  'Светлана (Авто)',
];

export async function addBotToRoom(code: string): Promise<void> {
  const room = await readRoomRaw(code);
  if (!room || room.status !== 'LOBBY') return;

  const existingNames = new Set(Object.values(room.players).map((p) => p.name));
  const botName =
    BOT_NAMES.find((n) => !existingNames.has(n)) ||
    `Кандидат-${Object.keys(room.players).length + 1}`;
  const botUid = `bot_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const selectedPacks = getRoomSelectedPacks(room);

  room.players[botUid] = {
    uid: botUid,
    name: botName,
    isHost: false,
    isAlive: true,
    isBot: true,
    joinedAt: Date.now(),
    lastSeen: Date.now(),
    revealedInRound: 0,
    attributes: generatePlayerAttributesFromPacks(selectedPacks),
  };

  const totalPlayers = Object.keys(room.players).length;
  room.settings.capacity = Math.max(1, Math.floor(totalPlayers / 2));
  room.logs = [
    ...(room.logs || []),
    `${formatTimeNow()}: Добавлен тестовый игрок ${botName} (вместимость бункера: ${room.settings.capacity}).`,
  ];

  await writeRoomRaw(code, room);
}

export async function updateBunkerSettings(
  code: string,
  partialSettings: Partial<BunkerSettings>
): Promise<void> {
  const room = await readRoomRaw(code);
  if (!room) return;

  if (partialSettings.packIds && partialSettings.packIds.length > 0) {
    const selectedPacks = getPacksByIds(partialSettings.packIds);
    partialSettings.packNames = selectedPacks.map((p) => p.name);
    partialSettings.packId = partialSettings.packIds[0];
  }

  room.settings = {
    ...room.settings,
    ...partialSettings,
  };

  await writeRoomRaw(code, room);
}

export async function startGame(code: string): Promise<void> {
  const room = await readRoomRaw(code);
  if (!room) return;

  const selectedPacks = getRoomSelectedPacks(room);
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
    throw new Error('Для старта игры нужно минимум 2 участника.');
  }

  for (const uid of playerUids) {
    room.players[uid].isAlive = true;
    room.players[uid].revealedInRound = 0;
    room.players[uid].voteModifiers = {};
    room.players[uid].attributes = generatePlayerAttributesFromPacks(
      selectedPacks,
      usedTracker
    );
  }

  const cap = Math.max(
    1,
    Math.min(
      playerUids.length - 1,
      Number(room.settings.capacity) || Math.floor(playerUids.length / 2)
    )
  );
  room.settings.capacity = cap;

  room.status = 'PLAYING';
  room.round = 1;
  room.turnOrder = playerUids;
  room.currentTurnUid = playerUids[0];
  room.votes = {};
  room.tiedCandidates = [];
  room.lastExileResult = null;
  room.timerEndAt =
    room.settings.roundTimerSeconds > 0
      ? Date.now() + room.settings.roundTimerSeconds * 1000
      : null;

  room.logs = [
    ...(room.logs || []),
    `${formatTimeNow()}: === СИРЕНА ТРЕВОГИ! ИГРА НАЧАЛАСЬ (Раунд 1) ===`,
    `${formatTimeNow()}: Активные паки: ${(room.settings.packNames || []).join(', ') || 'Базовый'}. Мест в бункере: ${cap} из ${playerUids.length}.`,
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

  sourceCard.revealed = true;
  sourceCard.ability.used = true;

  const ability = sourceCard.ability;
  const targetPlayer =
    (targetPlayerUid && room.players[targetPlayerUid]) || actor;
  const selectedPacks = getRoomSelectedPacks(room);
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
      const newCard = drawSingleAttributeCardFromPacks(
        selectedPacks,
        attrToReroll,
        existingTexts
      );
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
  room.timerEndAt = Date.now() + 60 * 1000;
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

  if (leaders.length > 1 && room.status === 'VOTING') {
    room.status = 'TIE_DEFENSE';
    room.tiedCandidates = leaders;
    room.timerEndAt = Date.now() + 30 * 1000;
    const tiedNames = leaders.map((id) => room.players[id]?.name).join(' и ');
    room.logs = [
      ...(room.logs || []),
      `${formatTimeNow()}: ⚠️ НИЧЬЯ НА ГОЛОСОВАНИИ (${maxVotes} гол.) между: ${tiedNames}! Объявляется фаза оправдательных речей (30 секунд).`,
    ];
    await writeRoomRaw(code, room);
    return;
  }

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
      exiledUid = leaders[Math.floor(Math.random() * leaders.length)];
    }
  }

  const exiledPlayer = room.players[exiledUid];
  const currentRound = room.round || 1;
  if (exiledPlayer) {
    exiledPlayer.isAlive = false;
    room.lastExileResult = {
      id: `exile_r${currentRound}_${Date.now()}`,
      round: currentRound,
      exiledUid,
      exiledName: exiledPlayer.name,
      maxVotes,
      tally: { ...tally },
      voterChoices: { ...votes },
      timestamp: Date.now(),
    };
    room.logs = [
      ...(room.logs || []),
      `${formatTimeNow()}: 🚪 Большинством голосов (${maxVotes} гол.) из бункера был изгнан: ${exiledPlayer.name} (переведён в статус «Наблюдатель»).`,
    ];
  }

  room.votes = {};
  room.tiedCandidates = [];

  const alivePlayers = Object.values(room.players).filter((p) => p.isAlive);
  if (alivePlayers.length <= room.settings.capacity) {
    room.status = 'FINALE';
    room.timerEndAt = null;
    room.logs = [
      ...(room.logs || []),
      `${formatTimeNow()}: 🔒 Число выживших (${alivePlayers.length}) сравнялось с вместимостью бункера (${room.settings.capacity}). БУНКЕР ЗАГЕРМЕТИЗИРОВАН!`,
    ];
    await writeRoomRaw(code, room);
    return;
  }

  room.status = 'PLAYING';
  room.round = currentRound + 1;
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

export async function triggerStandardFinale(code: string): Promise<void> {
  const room = await readRoomRaw(code);
  if (!room) return;

  room.status = 'FINALE';
  room.timerEndAt = null;
  room.logs = [
    ...(room.logs || []),
    `${formatTimeNow()}: 🔒 Гермодвери бункера запечатаны. Подведение итогов выживания.`,
  ];
  await writeRoomRaw(code, room);
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
      await deleteRoomCompletely(code);
      return;
    }
    room.settings.capacity = Math.max(1, Math.floor(remaining.length / 2));
  } else {
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
  room.lastExileResult = null;
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

async function triggerBotMovesIfNeeded(code: string): Promise<void> {
  const room = await readRoomRaw(code);
  if (!room) return;

  let changed = false;

  if (room.status === 'PLAYING') {
    for (const player of Object.values(room.players)) {
      if (player.isBot && player.isAlive && (player.revealedInRound || 0) < 1) {
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

export async function deleteEntityFromFirebase(
  collectionPath: 'packs' | 'catastrophes' | 'bunkers',
  id: string
): Promise<void> {
  try {
    if (currentMode === 'firebase-rtdb' && rtdbInstance) {
      await remove(ref(rtdbInstance, `${collectionPath}/${id}`));
    } else if (currentMode === 'firebase-firestore' && firestoreInstance) {
      await deleteDoc(doc(firestoreInstance, collectionPath, id));
    }
  } catch {
    // ignore
  }
}
