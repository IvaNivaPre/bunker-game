import { DEFAULT_PACKS } from '../data/defaultPacks';
import { FirebaseConfig, GamePack } from '../types/game';

const KEYS = {
  FIREBASE_CONFIG: 'bunker_firebase_config_v1',
  GEMINI_API_KEY: 'bunker_gemini_api_key_v1',
  GEMINI_MODEL: 'bunker_gemini_model_v1',
  ADMIN_PASSWORD_HASH: 'bunker_admin_pwd_v1',
  CUSTOM_PACKS: 'bunker_custom_packs_v1',
  ACTIVE_PACK_ID: 'bunker_active_pack_id_v1',
  USER_UID: 'bunker_user_uid_v1',
  USER_NAME: 'bunker_user_name_v1',
  LAST_ROOM: 'bunker_last_room_v1',
  SOUND_ENABLED: 'bunker_sound_enabled_v1',
};

export function getOrCreateUserUid(): string {
  let uid = localStorage.getItem(KEYS.USER_UID);
  if (!uid) {
    const randomPart = Math.random().toString(36).substring(2, 9);
    const timePart = Date.now().toString(36).slice(-4);
    uid = `usr_${randomPart}_${timePart}`;
    localStorage.setItem(KEYS.USER_UID, uid);
  }
  return uid;
}

export function getSavedUserName(): string {
  return localStorage.getItem(KEYS.USER_NAME) || '';
}

export function saveUserName(name: string): void {
  localStorage.setItem(KEYS.USER_NAME, name.trim());
}

export function getLastRoomCode(): string | null {
  return localStorage.getItem(KEYS.LAST_ROOM);
}

export function saveLastRoomCode(code: string | null): void {
  if (!code) {
    localStorage.removeItem(KEYS.LAST_ROOM);
  } else {
    localStorage.setItem(KEYS.LAST_ROOM, code.toUpperCase());
  }
}

export function getSoundEnabled(): boolean {
  const val = localStorage.getItem(KEYS.SOUND_ENABLED);
  return val === null ? true : val === 'true';
}

export function setSoundEnabled(enabled: boolean): void {
  localStorage.setItem(KEYS.SOUND_ENABLED, String(enabled));
}

/**
 * Parses either strict JSON or a copy-pasted JS object snippet from Firebase Console
 */
export function parseFirebaseConfigInput(rawInput: string): FirebaseConfig {
  const trimmed = rawInput.trim();
  if (!trimmed) {
    throw new Error('Поле конфигурации пустое');
  }

  // Try strict JSON first
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === 'object' && parsed.apiKey && parsed.projectId) {
      return parsed as FirebaseConfig;
    }
  } catch {
    // Fallback to extracting fields from JS snippet like `const firebaseConfig = { apiKey: "...", ... }`
  }

  const extractField = (field: string): string | undefined => {
    const regex = new RegExp(`["']?${field}["']?\\s*:\\s*["']([^"']+)["']`, 'i');
    const match = trimmed.match(regex);
    return match ? match[1].trim() : undefined;
  };

  const apiKey = extractField('apiKey');
  const projectId = extractField('projectId');
  const authDomain = extractField('authDomain');
  const databaseURL = extractField('databaseURL');
  const storageBucket = extractField('storageBucket');
  const messagingSenderId = extractField('messagingSenderId');
  const appId = extractField('appId');

  if (!apiKey || !projectId) {
    throw new Error(
      'Не удалось найти обязательные поля "apiKey" и "projectId". Вставьте JSON-объект или код firebaseConfig из консоли Firebase.'
    );
  }

  const config: FirebaseConfig = {
    apiKey,
    projectId,
    ...(authDomain ? { authDomain } : {}),
    ...(databaseURL ? { databaseURL } : {}),
    ...(storageBucket ? { storageBucket } : {}),
    ...(messagingSenderId ? { messagingSenderId } : {}),
    ...(appId ? { appId } : {}),
  };

  return config;
}

export function getFirebaseConfig(): FirebaseConfig | null {
  const raw = localStorage.getItem(KEYS.FIREBASE_CONFIG);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as FirebaseConfig;
  } catch {
    return null;
  }
}

export function saveFirebaseConfig(config: FirebaseConfig | null): void {
  if (!config) {
    localStorage.removeItem(KEYS.FIREBASE_CONFIG);
  } else {
    localStorage.setItem(KEYS.FIREBASE_CONFIG, JSON.stringify(config, null, 2));
  }
}

export function getGeminiApiKey(): string {
  return localStorage.getItem(KEYS.GEMINI_API_KEY) || '';
}

export function saveGeminiApiKey(key: string): void {
  const cleaned = key.trim();
  if (!cleaned) {
    localStorage.removeItem(KEYS.GEMINI_API_KEY);
  } else {
    localStorage.setItem(KEYS.GEMINI_API_KEY, cleaned);
  }
}

export function getGeminiModel(): string {
  const stored = localStorage.getItem(KEYS.GEMINI_MODEL);
  if (!stored || stored.startsWith('gemini-1.5')) {
    return 'gemini-2.5-flash';
  }
  return stored;
}

export function saveGeminiModel(model: string): void {
  localStorage.setItem(KEYS.GEMINI_MODEL, model);
}

// Admin password management
export function hasAdminPassword(): boolean {
  return Boolean(localStorage.getItem(KEYS.ADMIN_PASSWORD_HASH));
}

export function setAdminPassword(password: string): void {
  const encoded = btoa(encodeURIComponent(password.trim()));
  localStorage.setItem(KEYS.ADMIN_PASSWORD_HASH, encoded);
}

export function verifyAdminPassword(password: string): boolean {
  const stored = localStorage.getItem(KEYS.ADMIN_PASSWORD_HASH);
  if (!stored) return false;
  const encoded = btoa(encodeURIComponent(password.trim()));
  return stored === encoded;
}

// Packs management
export function getAllPacks(): GamePack[] {
  const customRaw = localStorage.getItem(KEYS.CUSTOM_PACKS);
  let customPacks: GamePack[] = [];
  if (customRaw) {
    try {
      customPacks = JSON.parse(customRaw);
    } catch {
      customPacks = [];
    }
  }

  // Merge built-in packs (unless overridden by same id in customPacks)
  const customIds = new Set(customPacks.map((p) => p.id));
  const builtIns = DEFAULT_PACKS.filter((p) => !customIds.has(p.id));
  return [...builtIns, ...customPacks];
}

export function saveCustomPack(pack: GamePack): GamePack[] {
  const customRaw = localStorage.getItem(KEYS.CUSTOM_PACKS);
  let customPacks: GamePack[] = [];
  if (customRaw) {
    try {
      customPacks = JSON.parse(customRaw);
    } catch {
      customPacks = [];
    }
  }

  const idx = customPacks.findIndex((p) => p.id === pack.id);
  if (idx >= 0) {
    customPacks[idx] = pack;
  } else {
    customPacks.push(pack);
  }

  localStorage.setItem(KEYS.CUSTOM_PACKS, JSON.stringify(customPacks));
  return getAllPacks();
}

export function deleteCustomPack(packId: string): GamePack[] {
  const customRaw = localStorage.getItem(KEYS.CUSTOM_PACKS);
  if (!customRaw) return getAllPacks();
  try {
    const customPacks: GamePack[] = JSON.parse(customRaw);
    const filtered = customPacks.filter((p) => p.id !== packId);
    localStorage.setItem(KEYS.CUSTOM_PACKS, JSON.stringify(filtered));
  } catch {
    // ignore
  }
  return getAllPacks();
}

export function getActivePackId(): string {
  return localStorage.getItem(KEYS.ACTIVE_PACK_ID) || DEFAULT_PACKS[0].id;
}

export function setActivePackId(packId: string): void {
  localStorage.setItem(KEYS.ACTIVE_PACK_ID, packId);
}

export function getPackById(packId?: string): GamePack {
  const packs = getAllPacks();
  const targetId = packId || getActivePackId();
  return packs.find((p) => p.id === targetId) || packs[0] || DEFAULT_PACKS[0];
}

