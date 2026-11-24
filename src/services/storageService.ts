import {
  DEFAULT_BUNKERS,
  DEFAULT_CATASTROPHES,
  DEFAULT_PACKS,
} from '../data/defaultPacks';
import {
  BunkerPreset,
  CatastrophePreset,
  FirebaseConfig,
  GamePack,
} from '../types/game';

const KEYS = {
  FIREBASE_CONFIG: 'bunker_firebase_config_v1',
  ADMIN_PASSWORD_HASH: 'bunker_admin_pwd_v1',
  CUSTOM_PACKS: 'bunker_custom_packs_v2',
  DELETED_PACK_IDS: 'bunker_deleted_pack_ids_v2',
  CUSTOM_CATASTROPHES: 'bunker_custom_catastrophes_v2',
  DELETED_CATASTROPHE_IDS: 'bunker_deleted_catastrophe_ids_v2',
  CUSTOM_BUNKERS: 'bunker_custom_bunkers_v2',
  DELETED_BUNKER_IDS: 'bunker_deleted_bunker_ids_v2',
  ACTIVE_PACK_IDS: 'bunker_active_pack_ids_v2',
  USER_UID: 'bunker_user_uid_v1',
  USER_NAME: 'bunker_user_name_v1',
  LAST_ROOM: 'bunker_last_room_v1',
  SOUND_ENABLED: 'bunker_sound_enabled_v1',
  DELETED_TIMESTAMPS: 'bunker_deleted_timestamps_v1',
};

const libraryBroadcastChannel =
  typeof window !== 'undefined' && 'BroadcastChannel' in window
    ? new BroadcastChannel('bunker_online_library_sync')
    : null;

export function notifyLibraryUpdated(broadcast = true): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('bunker-library-updated'));
  }
  if (broadcast && libraryBroadcastChannel) {
    try {
      libraryBroadcastChannel.postMessage({ updatedAt: Date.now() });
    } catch {
      // ignore
    }
  }
}

if (libraryBroadcastChannel) {
  libraryBroadcastChannel.onmessage = () => {
    notifyLibraryUpdated(false);
  };
}

export type EntityCollectionKind = 'packs' | 'catastrophes' | 'bunkers';

export function getDeletedTimestamps(): Record<string, number> {
  const raw = localStorage.getItem(KEYS.DELETED_TIMESTAMPS);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function setDeletedTimestamp(
  kind: EntityCollectionKind,
  id: string,
  timestamp: number | null
): void {
  const map = getDeletedTimestamps();
  const compositeKey = `${kind}:${id}`;
  if (timestamp === null) {
    delete map[compositeKey];
  } else {
    map[compositeKey] = Math.max(map[compositeKey] || 0, timestamp);
  }
  localStorage.setItem(KEYS.DELETED_TIMESTAMPS, JSON.stringify(map));
}

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
    localStorage.setItem(KEYS.LAST_ROOM, code.trim().toUpperCase());
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

  return {
    apiKey,
    projectId,
    ...(authDomain ? { authDomain } : {}),
    ...(databaseURL ? { databaseURL } : {}),
    ...(storageBucket ? { storageBucket } : {}),
    ...(messagingSenderId ? { messagingSenderId } : {}),
    ...(appId ? { appId } : {}),
  };
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

function getStringArrayFromStorage(key: string): string[] {
  const raw = localStorage.getItem(key);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// ============================================================================
// 1. ПАКИ ХАРАКТЕРИСТИК (GamePack)
// ============================================================================
export function getCustomPacksOnly(): GamePack[] {
  const customRaw = localStorage.getItem(KEYS.CUSTOM_PACKS);
  if (!customRaw) return [];
  try {
    const parsed = JSON.parse(customRaw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function getDeletedPackIds(): string[] {
  return getStringArrayFromStorage(KEYS.DELETED_PACK_IDS);
}

export function getAllPacks(): GamePack[] {
  const customPacks = getCustomPacksOnly();
  const deletedIds = new Set(getDeletedPackIds());
  const customIds = new Set(customPacks.map((p) => p.id));
  const builtIns = DEFAULT_PACKS.filter(
    (p) => !customIds.has(p.id) && !deletedIds.has(p.id)
  );
  const merged = [...builtIns, ...customPacks.filter((p) => !deletedIds.has(p.id))];
  return merged.map((p) => ({
    ...p,
    tags: Array.isArray(p.tags) ? p.tags : ['пользовательский'],
    createdAt: p.createdAt || Date.now(),
    updatedAt: p.updatedAt || p.createdAt || 0,
  }));
}

export function saveCustomPack(pack: GamePack, silent = false): GamePack[] {
  const customPacks = getCustomPacksOnly();

  const now = Date.now();
  const normalized: GamePack = {
    ...pack,
    tags: Array.isArray(pack.tags) ? pack.tags : ['пользовательский'],
    createdAt: pack.createdAt || now,
    updatedAt: pack.updatedAt || now,
  };

  const idx = customPacks.findIndex((p) => p.id === normalized.id);
  if (idx >= 0) {
    customPacks[idx] = normalized;
  } else {
    customPacks.push(normalized);
  }

  // Remove from deletedIds if re-added
  const deletedIds = getStringArrayFromStorage(KEYS.DELETED_PACK_IDS).filter(
    (id) => id !== normalized.id
  );
  localStorage.setItem(KEYS.DELETED_PACK_IDS, JSON.stringify(deletedIds));
  setDeletedTimestamp('packs', normalized.id, null);
  localStorage.setItem(KEYS.CUSTOM_PACKS, JSON.stringify(customPacks));
  if (!silent) notifyLibraryUpdated();
  return getAllPacks();
}

export function deletePackById(
  packId: string,
  deletedAt: number = Date.now(),
  silent = false
): GamePack[] {
  const customPacks = getCustomPacksOnly();
  const filtered = customPacks.filter((p) => p.id !== packId);
  localStorage.setItem(KEYS.CUSTOM_PACKS, JSON.stringify(filtered));

  const deletedIds = new Set(getStringArrayFromStorage(KEYS.DELETED_PACK_IDS));
  deletedIds.add(packId);
  localStorage.setItem(KEYS.DELETED_PACK_IDS, JSON.stringify(Array.from(deletedIds)));
  setDeletedTimestamp('packs', packId, deletedAt);
  if (!silent) notifyLibraryUpdated();
  return getAllPacks();
}

export function mergeServerPackIntoLocal(pack: GamePack): boolean {
  if (!pack || !pack.id || !pack.cards) return false;
  const deletedTs = getDeletedTimestamps()[`packs:${pack.id}`] || 0;
  const incomingTs = pack.updatedAt || pack.createdAt || 0;
  if (deletedTs > incomingTs) return false;

  const customPacks = getCustomPacksOnly();
  const existing = customPacks.find((p) => p.id === pack.id);
  const existingTs = existing ? existing.updatedAt || existing.createdAt || 0 : 0;
  if (existing && existingTs >= incomingTs) return false;

  saveCustomPack(
    {
      ...pack,
      tags: Array.isArray(pack.tags) ? pack.tags : ['пользовательский'],
      createdAt: pack.createdAt || incomingTs || Date.now(),
      updatedAt: incomingTs || Date.now(),
    },
    true
  );
  notifyLibraryUpdated(false);
  return true;
}

export function applyServerPackDeletion(
  packId: string,
  deletedAt: number
): boolean {
  if (!packId) return false;
  const existing = getCustomPacksOnly().find((p) => p.id === packId);
  const existingTs = existing ? existing.updatedAt || existing.createdAt || 0 : 0;
  if (existing && existingTs > deletedAt) return false;

  const alreadyDeleted = getDeletedPackIds().includes(packId);
  const prevDelTs = getDeletedTimestamps()[`packs:${packId}`] || 0;
  if (alreadyDeleted && prevDelTs >= deletedAt) return false;

  deletePackById(packId, deletedAt, true);
  notifyLibraryUpdated(false);
  return true;
}

export function getActivePackIds(): string[] {
  const stored = getStringArrayFromStorage(KEYS.ACTIVE_PACK_IDS);
  const available = getAllPacks();
  const availableIds = new Set(available.map((p) => p.id));
  const valid = stored.filter((id) => availableIds.has(id));
  if (valid.length > 0) return valid;
  return available.length > 0 ? [available[0].id] : [DEFAULT_PACKS[0].id];
}

export function setActivePackIds(packIds: string[]): void {
  localStorage.setItem(KEYS.ACTIVE_PACK_IDS, JSON.stringify(packIds));
}

export function getPacksByIds(packIds?: string[]): GamePack[] {
  const all = getAllPacks();
  if (!packIds || packIds.length === 0) {
    return all.length > 0 ? [all[0]] : [DEFAULT_PACKS[0]];
  }
  const idSet = new Set(packIds);
  const matched = all.filter((p) => idSet.has(p.id));
  return matched.length > 0 ? matched : all.length > 0 ? [all[0]] : [DEFAULT_PACKS[0]];
}

export function getPackById(packId?: string): GamePack {
  return getPacksByIds(packId ? [packId] : undefined)[0];
}

// ============================================================================
// 2. СЦЕНАРИИ КАТАСТРОФ (CatastrophePreset)
// ============================================================================
export function getCustomCatastrophesOnly(): CatastrophePreset[] {
  const raw = localStorage.getItem(KEYS.CUSTOM_CATASTROPHES);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function getAllCatastrophePresets(): CatastrophePreset[] {
  const custom = getCustomCatastrophesOnly();
  const deletedIds = new Set(getStringArrayFromStorage(KEYS.DELETED_CATASTROPHE_IDS));
  const customIds = new Set(custom.map((c) => c.id));
  const builtIns = DEFAULT_CATASTROPHES.filter(
    (c) => !customIds.has(c.id) && !deletedIds.has(c.id)
  );
  return [...builtIns, ...custom.filter((c) => !deletedIds.has(c.id))];
}

export function saveCatastrophePreset(
  preset: CatastrophePreset,
  silent = false
): CatastrophePreset[] {
  const custom = getCustomCatastrophesOnly();
  const now = Date.now();
  const normalized: CatastrophePreset = {
    ...preset,
    tags: Array.isArray(preset.tags) ? preset.tags : ['катастрофа'],
    createdAt: preset.createdAt || now,
    updatedAt: preset.updatedAt || now,
  };
  const idx = custom.findIndex((c) => c.id === normalized.id);
  if (idx >= 0) {
    custom[idx] = normalized;
  } else {
    custom.push(normalized);
  }
  const deletedIds = getStringArrayFromStorage(KEYS.DELETED_CATASTROPHE_IDS).filter(
    (id) => id !== normalized.id
  );
  localStorage.setItem(KEYS.DELETED_CATASTROPHE_IDS, JSON.stringify(deletedIds));
  setDeletedTimestamp('catastrophes', normalized.id, null);
  localStorage.setItem(KEYS.CUSTOM_CATASTROPHES, JSON.stringify(custom));
  if (!silent) notifyLibraryUpdated();
  return getAllCatastrophePresets();
}

export function deleteCatastrophePreset(
  id: string,
  deletedAt: number = Date.now(),
  silent = false
): CatastrophePreset[] {
  const custom = getCustomCatastrophesOnly();
  localStorage.setItem(
    KEYS.CUSTOM_CATASTROPHES,
    JSON.stringify(custom.filter((c) => c.id !== id))
  );
  const deletedIds = new Set(getStringArrayFromStorage(KEYS.DELETED_CATASTROPHE_IDS));
  deletedIds.add(id);
  localStorage.setItem(
    KEYS.DELETED_CATASTROPHE_IDS,
    JSON.stringify(Array.from(deletedIds))
  );
  setDeletedTimestamp('catastrophes', id, deletedAt);
  if (!silent) notifyLibraryUpdated();
  return getAllCatastrophePresets();
}

export function mergeServerCatastropheIntoLocal(
  preset: CatastrophePreset
): boolean {
  if (!preset || !preset.id) return false;
  const deletedTs = getDeletedTimestamps()[`catastrophes:${preset.id}`] || 0;
  const incomingTs = preset.updatedAt || preset.createdAt || 0;
  if (deletedTs > incomingTs) return false;

  const custom = getCustomCatastrophesOnly();
  const existing = custom.find((c) => c.id === preset.id);
  const existingTs = existing ? existing.updatedAt || existing.createdAt || 0 : 0;
  if (existing && existingTs >= incomingTs) return false;

  saveCatastrophePreset(
    {
      ...preset,
      tags: Array.isArray(preset.tags) ? preset.tags : ['катастрофа'],
      createdAt: preset.createdAt || incomingTs || Date.now(),
      updatedAt: incomingTs || Date.now(),
    },
    true
  );
  notifyLibraryUpdated(false);
  return true;
}

export function applyServerCatastropheDeletion(
  id: string,
  deletedAt: number
): boolean {
  if (!id) return false;
  const existing = getCustomCatastrophesOnly().find((c) => c.id === id);
  const existingTs = existing ? existing.updatedAt || existing.createdAt || 0 : 0;
  if (existing && existingTs > deletedAt) return false;

  const deletedIds = getStringArrayFromStorage(KEYS.DELETED_CATASTROPHE_IDS);
  const prevDelTs = getDeletedTimestamps()[`catastrophes:${id}`] || 0;
  if (deletedIds.includes(id) && prevDelTs >= deletedAt) return false;

  deleteCatastrophePreset(id, deletedAt, true);
  notifyLibraryUpdated(false);
  return true;
}

// ============================================================================
// 3. ПРЕСЕТЫ БУНКЕРА (BunkerPreset)
// ============================================================================
export function getCustomBunkersOnly(): BunkerPreset[] {
  const raw = localStorage.getItem(KEYS.CUSTOM_BUNKERS);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function getAllBunkerPresets(): BunkerPreset[] {
  const custom = getCustomBunkersOnly();
  const deletedIds = new Set(getStringArrayFromStorage(KEYS.DELETED_BUNKER_IDS));
  const customIds = new Set(custom.map((b) => b.id));
  const builtIns = DEFAULT_BUNKERS.filter(
    (b) => !customIds.has(b.id) && !deletedIds.has(b.id)
  );
  return [...builtIns, ...custom.filter((b) => !deletedIds.has(b.id))];
}

export function saveBunkerPreset(
  preset: BunkerPreset,
  silent = false
): BunkerPreset[] {
  const custom = getCustomBunkersOnly();
  const now = Date.now();
  const normalized: BunkerPreset = {
    ...preset,
    tags: Array.isArray(preset.tags) ? preset.tags : ['бункер'],
    createdAt: preset.createdAt || now,
    updatedAt: preset.updatedAt || now,
  };
  const idx = custom.findIndex((b) => b.id === normalized.id);
  if (idx >= 0) {
    custom[idx] = normalized;
  } else {
    custom.push(normalized);
  }
  const deletedIds = getStringArrayFromStorage(KEYS.DELETED_BUNKER_IDS).filter(
    (id) => id !== normalized.id
  );
  localStorage.setItem(KEYS.DELETED_BUNKER_IDS, JSON.stringify(deletedIds));
  setDeletedTimestamp('bunkers', normalized.id, null);
  localStorage.setItem(KEYS.CUSTOM_BUNKERS, JSON.stringify(custom));
  if (!silent) notifyLibraryUpdated();
  return getAllBunkerPresets();
}

export function deleteBunkerPreset(
  id: string,
  deletedAt: number = Date.now(),
  silent = false
): BunkerPreset[] {
  const custom = getCustomBunkersOnly();
  localStorage.setItem(
    KEYS.CUSTOM_BUNKERS,
    JSON.stringify(custom.filter((b) => b.id !== id))
  );
  const deletedIds = new Set(getStringArrayFromStorage(KEYS.DELETED_BUNKER_IDS));
  deletedIds.add(id);
  localStorage.setItem(
    KEYS.DELETED_BUNKER_IDS,
    JSON.stringify(Array.from(deletedIds))
  );
  setDeletedTimestamp('bunkers', id, deletedAt);
  if (!silent) notifyLibraryUpdated();
  return getAllBunkerPresets();
}

export function mergeServerBunkerIntoLocal(preset: BunkerPreset): boolean {
  if (!preset || !preset.id) return false;
  const deletedTs = getDeletedTimestamps()[`bunkers:${preset.id}`] || 0;
  const incomingTs = preset.updatedAt || preset.createdAt || 0;
  if (deletedTs > incomingTs) return false;

  const custom = getCustomBunkersOnly();
  const existing = custom.find((b) => b.id === preset.id);
  const existingTs = existing ? existing.updatedAt || existing.createdAt || 0 : 0;
  if (existing && existingTs >= incomingTs) return false;

  saveBunkerPreset(
    {
      ...preset,
      tags: Array.isArray(preset.tags) ? preset.tags : ['бункер'],
      createdAt: preset.createdAt || incomingTs || Date.now(),
      updatedAt: incomingTs || Date.now(),
    },
    true
  );
  notifyLibraryUpdated(false);
  return true;
}

export function applyServerBunkerDeletion(
  id: string,
  deletedAt: number
): boolean {
  if (!id) return false;
  const existing = getCustomBunkersOnly().find((b) => b.id === id);
  const existingTs = existing ? existing.updatedAt || existing.createdAt || 0 : 0;
  if (existing && existingTs > deletedAt) return false;

  const deletedIds = getStringArrayFromStorage(KEYS.DELETED_BUNKER_IDS);
  const prevDelTs = getDeletedTimestamps()[`bunkers:${id}`] || 0;
  if (deletedIds.includes(id) && prevDelTs >= deletedAt) return false;

  deleteBunkerPreset(id, deletedAt, true);
  notifyLibraryUpdated(false);
  return true;
}
