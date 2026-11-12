import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  X,
  Lock,
  Database,
  Package,
  KeyRound,
  CheckCircle2,
  AlertCircle,
  Download,
  Upload,
  Plus,
  Trash2,
  Copy,
  Save,
  ShieldCheck,
  Search,
  ArrowUpDown,
  Tag,
  Radio,
  RefreshCw,
  ShieldAlert,
  Home,
  Layers,
  AlertTriangle,
} from 'lucide-react';
import {
  ATTRIBUTE_METADATA,
  AbilityEffectType,
  AbilityUsageType,
  AdminEntityFilter,
  AttributeKey,
  BunkerPreset,
  CardRarity,
  CatastrophePreset,
  GamePack,
  PackCardItem,
  PackSortOption,
  RoomData,
  getPackTotalCards,
} from '../types/game';
import {
  deleteBunkerPreset,
  deleteCatastrophePreset,
  deletePackById,
  getAllBunkerPresets,
  getAllCatastrophePresets,
  getAllPacks,
  getFirebaseConfig,
  hasAdminPassword,
  parseFirebaseConfigInput,
  saveBunkerPreset,
  saveCatastrophePreset,
  saveCustomPack,
  saveFirebaseConfig,
  setAdminPassword,
  verifyAdminPassword,
} from '../services/storageService';
import {
  cleanupStaleRooms,
  deleteEntityFromFirebase,
  deleteRoomCompletely,
  getSyncMode,
  initFirebaseFromStorage,
  listAllActiveRooms,
  testFirebaseConnection,
} from '../services/firebaseService';

interface AdminModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSettingsChanged: () => void;
  isFullPageRoute?: boolean;
}

const EFFECT_TYPE_LABELS: { value: AbilityEffectType; label: string }[] = [
  { value: 'heal_player', label: 'Вылечить здоровье игрока (heal_player)' },
  { value: 'cure_phobia', label: 'Устранить фобию игрока (cure_phobia)' },
  { value: 'force_reveal', label: 'Принудительно вскрыть карту цели (force_reveal)' },
  { value: 'reroll_attribute', label: 'Перебросить характеристику из колоды (reroll_attribute)' },
  { value: 'swap_inventory', label: 'Обменяться крупным инвентарём (swap_inventory)' },
  { value: 'swap_backpack', label: 'Обменяться рюкзаком (swap_backpack)' },
  { value: 'shield_vote', label: 'Щит на голосовании -1 голос против себя (shield_vote)' },
  { value: 'double_vote', label: 'Двойной голос на трибунале (double_vote)' },
  { value: 'block_vote', label: 'Лишить игрока права голоса (block_vote)' },
  { value: 'bunker_upgrade', label: 'Модернизировать запасы бункера (bunker_upgrade)' },
  { value: 'world_intel', label: 'Разведданные о внешнем мире (world_intel)' },
];

interface DeleteConfirmTarget {
  kind: 'pack' | 'catastrophe' | 'bunker' | 'room';
  id: string;
  title: string;
}

export const AdminModal: React.FC<AdminModalProps> = ({
  isOpen,
  onClose,
  onSettingsChanged,
  isFullPageRoute = false,
}) => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [passwordInput, setPasswordInput] = useState<string>('');
  const [authError, setAuthError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<
    'entities' | 'rooms' | 'firebase' | 'security'
  >('entities');

  // Search, Filter & Sort state for Section 2.1 & 2.2
  const [entityFilter, setEntityFilter] = useState<AdminEntityFilter>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedTag, setSelectedTag] = useState<string>('all');
  const [sortBy, setSortBy] = useState<PackSortOption>('date');

  // Isolated Entities Data
  const [packs, setPacks] = useState<GamePack[]>(() => getAllPacks());
  const [catastrophes, setCatastrophes] = useState<CatastrophePreset[]>(() =>
    getAllCatastrophePresets()
  );
  const [bunkers, setBunkers] = useState<BunkerPreset[]>(() =>
    getAllBunkerPresets()
  );

  // Active pack being edited in detail
  const [editingPackId, setEditingPackId] = useState<string | null>(null);
  const [selectedAttrKey, setSelectedAttrKey] = useState<AttributeKey>('profession');
  const [noticeMsg, setNoticeMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // New card form inside pack editor
  const [newCardText, setNewCardText] = useState('');
  const [newCardCondition, setNewCardCondition] = useState('');
  const [newCardRarity, setNewCardRarity] = useState<CardRarity>('common');
  const [newAbilityName, setNewAbilityName] = useState('');
  const [newAbilityDesc, setNewAbilityDesc] = useState('');
  const [newAbilityType, setNewAbilityType] = useState<AbilityUsageType>('instant');
  const [newAbilityEffect, setNewAbilityEffect] = useState<AbilityEffectType>('force_reveal');

  // Safe Delete Confirmation Modal state (Section 2.3)
  const [confirmDelete, setConfirmDelete] = useState<DeleteConfirmTarget | null>(
    null
  );

  // Active Rooms management state (Section 2.4)
  const [activeRooms, setActiveRooms] = useState<RoomData[]>([]);
  const [loadingRooms, setLoadingRooms] = useState<boolean>(false);

  // Firebase state
  const existingFbConfig = getFirebaseConfig();
  const [fbText, setFbText] = useState<string>(
    existingFbConfig ? JSON.stringify(existingFbConfig, null, 2) : ''
  );
  const [fbStatus, setFbStatus] = useState<{
    type: 'idle' | 'loading' | 'success' | 'error';
    message: string;
  }>({ type: 'idle', message: '' });

  // Security password change
  const [newAdminPwd, setNewAdminPwd] = useState('');
  const [pwdSavedMsg, setPwdSavedMsg] = useState<string | null>(null);

  const refreshActiveRooms = async () => {
    setLoadingRooms(true);
    try {
      await cleanupStaleRooms();
      const list = await listAllActiveRooms();
      setActiveRooms(list);
    } finally {
      setLoadingRooms(false);
    }
  };

  useEffect(() => {
    if (isOpen && isAuthenticated && activeTab === 'rooms') {
      refreshActiveRooms();
    }
  }, [isOpen, isAuthenticated, activeTab]);

  // Collect all tags across all 3 entity types
  const allAvailableTags = useMemo(() => {
    const tagSet = new Set<string>();
    const addTags = (arr?: string[]) => {
      for (const t of arr || []) {
        if (t.trim()) tagSet.add(t.trim().toLowerCase());
      }
    };
    packs.forEach((p) => addTags(p.tags));
    catastrophes.forEach((c) => addTags(c.tags));
    bunkers.forEach((b) => addTags(b.tags));
    return Array.from(tagSet);
  }, [packs, catastrophes, bunkers]);

  // Filtered & sorted Characteristic Packs
  const filteredPacks = useMemo(() => {
    if (entityFilter !== 'all' && entityFilter !== 'packs') return [];
    const q = searchQuery.trim().toLowerCase();
    return packs
      .filter((p) => {
        if (selectedTag !== 'all') {
          const tagsLower = (p.tags || []).map((t) => t.toLowerCase());
          if (!tagsLower.includes(selectedTag)) return false;
        }
        if (!q) return true;
        return (
          p.name.toLowerCase().includes(q) ||
          (p.description || '').toLowerCase().includes(q) ||
          (p.tags || []).some((t) => t.toLowerCase().includes(q))
        );
      })
      .sort((a, b) => {
        if (sortBy === 'alphabet') return a.name.localeCompare(b.name, 'ru');
        if (sortBy === 'cardsCount') return getPackTotalCards(b) - getPackTotalCards(a);
        return (b.createdAt || 0) - (a.createdAt || 0);
      });
  }, [packs, entityFilter, searchQuery, selectedTag, sortBy]);

  // Filtered & sorted Catastrophes
  const filteredCatastrophes = useMemo(() => {
    if (entityFilter !== 'all' && entityFilter !== 'catastrophes') return [];
    const q = searchQuery.trim().toLowerCase();
    return catastrophes
      .filter((c) => {
        if (selectedTag !== 'all') {
          const tagsLower = (c.tags || []).map((t) => t.toLowerCase());
          if (!tagsLower.includes(selectedTag)) return false;
        }
        if (!q) return true;
        return (
          c.title.toLowerCase().includes(q) ||
          (c.description || '').toLowerCase().includes(q) ||
          (c.threats || '').toLowerCase().includes(q) ||
          (c.tags || []).some((t) => t.toLowerCase().includes(q))
        );
      })
      .sort((a, b) => {
        if (sortBy === 'alphabet') return a.title.localeCompare(b.title, 'ru');
        return (b.createdAt || 0) - (a.createdAt || 0);
      });
  }, [catastrophes, entityFilter, searchQuery, selectedTag, sortBy]);

  // Filtered & sorted Bunkers
  const filteredBunkers = useMemo(() => {
    if (entityFilter !== 'all' && entityFilter !== 'bunkers') return [];
    const q = searchQuery.trim().toLowerCase();
    return bunkers
      .filter((b) => {
        if (selectedTag !== 'all') {
          const tagsLower = (b.tags || []).map((t) => t.toLowerCase());
          if (!tagsLower.includes(selectedTag)) return false;
        }
        if (!q) return true;
        return (
          b.name.toLowerCase().includes(q) ||
          (b.supplies || '').toLowerCase().includes(q) ||
          (b.tags || []).some((t) => t.toLowerCase().includes(q))
        );
      })
      .sort((a, b) => {
        if (sortBy === 'alphabet') return a.name.localeCompare(b.name, 'ru');
        if (sortBy === 'cardsCount') return (b.size || 0) - (a.size || 0);
        return (b.createdAt || 0) - (a.createdAt || 0);
      });
  }, [bunkers, entityFilter, searchQuery, selectedTag, sortBy]);

  if (!isOpen) return null;

  const isFirstInit = !hasAdminPassword();
  const editingPack = packs.find((p) => p.id === editingPackId) || null;

  const handleLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    if (!passwordInput.trim()) {
      setAuthError('Введите мастер-пароль');
      return;
    }
    if (isFirstInit) {
      setAdminPassword(passwordInput);
      setIsAuthenticated(true);
      setPasswordInput('');
    } else if (verifyAdminPassword(passwordInput)) {
      setIsAuthenticated(true);
      setPasswordInput('');
    } else {
      setAuthError('Неверный мастер-пароль администратора');
    }
  };

  // Safe Deletion Execution (Section 2.3 & 2.4)
  const executeConfirmedDelete = async () => {
    if (!confirmDelete) return;
    const { kind, id, title } = confirmDelete;
    setConfirmDelete(null);

    if (kind === 'pack') {
      const next = deletePackById(id);
      setPacks(next);
      if (editingPackId === id) setEditingPackId(null);
      await deleteEntityFromFirebase('packs', id);
      setNoticeMsg(`Пак характеристик «${title}» удалён.`);
      onSettingsChanged();
    } else if (kind === 'catastrophe') {
      const next = deleteCatastrophePreset(id);
      setCatastrophes(next);
      await deleteEntityFromFirebase('catastrophes', id);
      setNoticeMsg(`Сценарий катастрофы «${title}» удалён.`);
      onSettingsChanged();
    } else if (kind === 'bunker') {
      const next = deleteBunkerPreset(id);
      setBunkers(next);
      await deleteEntityFromFirebase('bunkers', id);
      setNoticeMsg(`Пресет бункера «${title}» удалён.`);
      onSettingsChanged();
    } else if (kind === 'room') {
      await deleteRoomCompletely(id);
      await refreshActiveRooms();
      setNoticeMsg(`Комната #${id} принудительно завершена и удалена из базы данных.`);
    }
  };

  // Create new Characteristic Pack
  const handleCreateNewPack = () => {
    const newPack: GamePack = {
      id: `pack_${Date.now()}`,
      name: 'Новый пак характеристик',
      description: 'Авторский набор карт для 11 характеристик выживших.',
      version: '1.0.0',
      tags: ['авторский', 'выживание'],
      createdAt: Date.now(),
      isBuiltIn: false,
      cards: {
        profession: [],
        gender: [],
        health: [],
        physique: [],
        hobby: [],
        trait: [],
        phobia: [],
        inventory: [],
        backpack: [],
        extra: [],
        specialCard: [],
      },
    };
    const next = saveCustomPack(newPack);
    setPacks(next);
    setEditingPackId(newPack.id);
    onSettingsChanged();
    setNoticeMsg('Создан новый пак характеристик! Откройте категории для добавления карт.');
  };

  const handleClonePack = (pack: GamePack) => {
    const cloned: GamePack = JSON.parse(JSON.stringify(pack));
    cloned.id = `pack_${Date.now()}`;
    cloned.name = `${pack.name} (Копия)`;
    cloned.createdAt = Date.now();
    cloned.isBuiltIn = false;
    const next = saveCustomPack(cloned);
    setPacks(next);
    setEditingPackId(cloned.id);
    onSettingsChanged();
    setNoticeMsg(`Создана копия пака: «${cloned.name}»`);
  };

  const handleExportPack = (pack: GamePack) => {
    const dataStr =
      'data:text/json;charset=utf-8,' +
      encodeURIComponent(JSON.stringify(pack, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `${pack.id}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const handleImportPackFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(String(event.target?.result)) as GamePack;
        if (!parsed.name || !parsed.cards) {
          throw new Error('Некорректный формат JSON пака');
        }
        parsed.id = parsed.id || `imported_${Date.now()}`;
        parsed.createdAt = Date.now();
        parsed.tags = Array.isArray(parsed.tags) ? parsed.tags : ['импорт'];
        parsed.isBuiltIn = false;
        const nextPacks = saveCustomPack(parsed);
        setPacks(nextPacks);
        setEditingPackId(parsed.id);
        onSettingsChanged();
        setNoticeMsg(`Пак «${parsed.name}» успешно импортирован!`);
      } catch (err) {
        alert(
          'Ошибка импорта JSON: ' + (err instanceof Error ? err.message : String(err))
        );
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const updateEditingPack = (updater: (draft: GamePack) => GamePack) => {
    if (!editingPack) return;
    const clone: GamePack = JSON.parse(JSON.stringify(editingPack));
    const updated = updater(clone);
    const next = saveCustomPack(updated);
    setPacks(next);
    onSettingsChanged();
  };

  const handleAddCardToCategory = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPack || !newCardText.trim()) return;

    const requiresAbility =
      selectedAttrKey === 'profession' ||
      selectedAttrKey === 'hobby' ||
      selectedAttrKey === 'specialCard';

    if (requiresAbility && (!newAbilityName.trim() || !newAbilityDesc.trim())) {
      alert(
        'Для карт «Профессия», «Хобби» и «Спец. возможность» поля названия и описания спец. способности обязательны!'
      );
      return;
    }

    const newItem: PackCardItem = {
      id: `${selectedAttrKey}_${Date.now()}`,
      text: newCardText.trim(),
      condition: newCardCondition.trim() || undefined,
      rarity: newCardRarity,
      ...(requiresAbility
        ? {
            ability: {
              name: newAbilityName.trim(),
              description: newAbilityDesc.trim(),
              type: newAbilityType,
              effectType: newAbilityEffect,
            },
          }
        : {}),
    };

    updateEditingPack((draft) => {
      draft.cards[selectedAttrKey] = [
        newItem,
        ...(draft.cards[selectedAttrKey] || []),
      ];
      return draft;
    });

    setNewCardText('');
    setNewCardCondition('');
    setNewAbilityName('');
    setNewAbilityDesc('');
    setNoticeMsg('Карта добавлена в пак!');
  };

  // Create new isolated Catastrophe Scenario
  const handleCreateCatastrophe = () => {
    const newCat: CatastrophePreset = {
      id: `cat_${Date.now()}`,
      title: 'Новый сценарий катастрофы',
      description: 'Подробное описание глобального катаклизма и условий на поверхности...',
      threats: 'Высокий уровень радиации, токсичная атмосфера, мороз -35°C',
      threatLevel: 'Критическая',
      tags: ['катастрофа', 'авторский'],
      createdAt: Date.now(),
      isBuiltIn: false,
    };
    const next = saveCatastrophePreset(newCat);
    setCatastrophes(next);
    setEntityFilter('catastrophes');
    onSettingsChanged();
    setNoticeMsg('Добавлен новый сценарий катастрофы.');
  };

  // Create new isolated Bunker Preset
  const handleCreateBunker = () => {
    const newBunk: BunkerPreset = {
      id: `bunk_${Date.now()}`,
      name: 'Новый пресет бункера',
      size: 120,
      duration: '3 года',
      supplies:
        'Автономный генератор, система фильтрации воздуха и воды, запас консервов на 2.5 года, медотсек',
      tags: ['бункер', 'авторский'],
      createdAt: Date.now(),
      isBuiltIn: false,
    };
    const next = saveBunkerPreset(newBunk);
    setBunkers(next);
    setEntityFilter('bunkers');
    onSettingsChanged();
    setNoticeMsg('Добавлен новый пресет бункера.');
  };

  const handleSaveAndTestFirebase = async () => {
    setFbStatus({
      type: 'loading',
      message: 'Проверка конфигурации и подключение к Firebase...',
    });
    try {
      const parsed = parseFirebaseConfigInput(fbText);
      saveFirebaseConfig(parsed);
      setFbText(JSON.stringify(parsed, null, 2));
      const testRes = await testFirebaseConnection(parsed);
      initFirebaseFromStorage();
      onSettingsChanged();
      setFbStatus({
        type: testRes.ok ? 'success' : 'error',
        message: testRes.message,
      });
    } catch (err) {
      setFbStatus({
        type: 'error',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const handleClearFirebase = () => {
    saveFirebaseConfig(null);
    setFbText('');
    initFirebaseFromStorage();
    onSettingsChanged();
    setFbStatus({
      type: 'success',
      message: 'Конфиг Firebase очищен. Включён автономный режим синхронизации вкладок.',
    });
  };

  return (
    <div
      className={
        isFullPageRoute
          ? 'min-h-screen bg-bunker-950 p-3 sm:p-6'
          : 'fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-2 sm:p-4 overflow-y-auto'
      }
    >
      <div
        className={`w-full max-w-6xl mx-auto bg-bunker-900 border-2 border-bunker-600 rounded-2xl shadow-2xl overflow-hidden flex flex-col ${
          isFullPageRoute ? 'min-h-[88vh]' : 'max-h-[93vh]'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-bunker-700 bg-bunker-950">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-amber-500/15 border border-amber-500/40 flex items-center justify-center text-amber-400">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-zinc-100 font-mono tracking-wide">
                ПАНЕЛЬ АДМИНИСТРИРОВАНИЯ (/admin) // УПРАВЛЕНИЕ ПАКАМИ И КОМНАТАМИ
              </h2>
              <p className="text-xs text-zinc-400">
                Изолированный редактор пресетов бункера, сценариев катастроф, паков характеристик и активных сессий
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="px-3 py-2 rounded-xl bg-bunker-800 hover:bg-bunker-700 text-zinc-200 text-xs font-mono flex items-center gap-1.5 transition"
          >
            <X className="w-4 h-4" />
            <span>На главную</span>
          </button>
        </div>

        {/* Auth Gate */}
        {!isAuthenticated ? (
          <form
            onSubmit={handleLoginSubmit}
            className="p-6 sm:p-10 max-w-md mx-auto w-full my-auto space-y-5"
          >
            <div className="text-center space-y-2">
              <div className="w-14 h-14 rounded-2xl bg-amber-500/15 border border-amber-500/40 flex items-center justify-center text-amber-400 mx-auto">
                <Lock className="w-7 h-7" />
              </div>
              <h3 className="text-xl font-bold text-zinc-100">
                {isFirstInit
                  ? 'Первичная инициализация пароля (/admin)'
                  : 'Вход в панель администратора (/admin)'}
              </h3>
              <p className="text-xs text-zinc-400 leading-relaxed">
                {isFirstInit
                  ? 'Задайте мастер-пароль для защиты редактора паков, управления активными комнатами и настроек Firebase.'
                  : 'Введите мастер-пароль администратора для доступа к закрытой панели.'}
              </p>
            </div>

            <div>
              <label className="block text-xs font-mono uppercase text-zinc-400 mb-1.5">
                Мастер-пароль:
              </label>
              <input
                type="password"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                placeholder={
                  isFirstInit ? 'Придумайте мастер-пароль...' : 'Введите пароль...'
                }
                autoFocus
                className="w-full bg-bunker-950 border border-bunker-600 rounded-xl px-4 py-3 text-sm text-zinc-100 focus:outline-none focus:border-amber-500 font-mono"
              />
            </div>

            {authError && (
              <div className="p-3 rounded-xl bg-red-500/15 border border-red-500/40 text-xs text-red-300 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{authError}</span>
              </div>
            )}

            <button
              type="submit"
              className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-bunker-950 font-bold text-sm uppercase tracking-wider transition"
            >
              {isFirstInit ? 'Сохранить пароль и войти' : 'Войти в /admin'}
            </button>
          </form>
        ) : (
          <>
            {/* Top Navigation Tabs */}
            <div className="flex border-b border-bunker-700 bg-bunker-950/60 px-4 overflow-x-auto">
              <button
                onClick={() => setActiveTab('entities')}
                className={`flex items-center gap-2 px-4 py-3 text-xs sm:text-sm font-mono border-b-2 transition whitespace-nowrap ${
                  activeTab === 'entities'
                    ? 'border-amber-500 text-amber-400 font-semibold'
                    : 'border-transparent text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Package className="w-4 h-4" />
                1. Редактор материалов (Паки / Катастрофы / Бункеры)
              </button>

              <button
                onClick={() => setActiveTab('rooms')}
                className={`flex items-center gap-2 px-4 py-3 text-xs sm:text-sm font-mono border-b-2 transition whitespace-nowrap ${
                  activeTab === 'rooms'
                    ? 'border-amber-500 text-amber-400 font-semibold'
                    : 'border-transparent text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Radio className="w-4 h-4" />
                2. Активные комнаты ({activeRooms.length})
              </button>

              <button
                onClick={() => setActiveTab('firebase')}
                className={`flex items-center gap-2 px-4 py-3 text-xs sm:text-sm font-mono border-b-2 transition whitespace-nowrap ${
                  activeTab === 'firebase'
                    ? 'border-amber-500 text-amber-400 font-semibold'
                    : 'border-transparent text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Database className="w-4 h-4" />
                3. Конфигуратор Firebase
              </button>

              <button
                onClick={() => setActiveTab('security')}
                className={`flex items-center gap-2 px-4 py-3 text-xs sm:text-sm font-mono border-b-2 transition whitespace-nowrap ${
                  activeTab === 'security'
                    ? 'border-amber-500 text-amber-400 font-semibold'
                    : 'border-transparent text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <KeyRound className="w-4 h-4" />
                4. Пароль администратора
              </button>
            </div>

            {/* Main Content */}
            <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-5">
              {noticeMsg && (
                <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-xs font-mono text-emerald-300 flex items-center justify-between">
                  <span>✓ {noticeMsg}</span>
                  <button
                    onClick={() => setNoticeMsg(null)}
                    className="text-emerald-200 hover:text-white"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              {/* =============================================================== */}
              {/* TAB 1: ИЗОЛИРОВАННЫЙ РЕДАКТОР СУЩНОСТЕЙ + ПОИСК/ФИЛЬТР/СОРТИРОВКА */}
              {/* =============================================================== */}
              {activeTab === 'entities' && (
                <div className="space-y-5">
                  {/* Creation Action Bar */}
                  <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-2xl bg-bunker-950 border border-bunker-700">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={handleCreateNewPack}
                        className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-bunker-950 font-bold text-xs font-mono flex items-center gap-1.5 transition"
                      >
                        <Plus className="w-4 h-4" /> + Пак характеристик
                      </button>
                      <button
                        type="button"
                        onClick={handleCreateCatastrophe}
                        className="px-3.5 py-2 rounded-xl bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 text-red-300 text-xs font-mono flex items-center gap-1.5 transition"
                      >
                        <Plus className="w-4 h-4" /> + Сценарий катастрофы
                      </button>
                      <button
                        type="button"
                        onClick={handleCreateBunker}
                        className="px-3.5 py-2 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-300 text-xs font-mono flex items-center gap-1.5 transition"
                      >
                        <Plus className="w-4 h-4" /> + Пресет бункера
                      </button>
                    </div>

                    <div>
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="px-3.5 py-2 rounded-xl bg-bunker-800 hover:bg-bunker-700 border border-bunker-600 text-zinc-200 text-xs font-mono flex items-center gap-1.5 transition"
                      >
                        <Upload className="w-4 h-4 text-amber-400" /> Импорт пака (JSON)
                      </button>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".json,application/json"
                        onChange={handleImportPackFile}
                        className="hidden"
                      />
                    </div>
                  </div>

                  {/* Search, Entity Type Filter, Tag Filter & Sorting Toolbar (Section 2.2) */}
                  <div className="p-4 rounded-2xl bg-bunker-950 border border-bunker-800 space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                      {/* Search input */}
                      <div className="md:col-span-5 relative">
                        <Search className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          placeholder="Поиск по названию, описанию или ключевым словам..."
                          className="w-full bg-bunker-900 border border-bunker-700 rounded-xl pl-10 pr-3 py-2.5 text-xs text-zinc-100 focus:outline-none focus:border-amber-500"
                        />
                      </div>

                      {/* Entity Type Filter */}
                      <div className="md:col-span-4 flex bg-bunker-900 p-1 rounded-xl border border-bunker-700">
                        {[
                          { id: 'all', label: 'Все' },
                          { id: 'packs', label: `Паки (${packs.length})` },
                          { id: 'catastrophes', label: `Катастрофы (${catastrophes.length})` },
                          { id: 'bunkers', label: `Бункеры (${bunkers.length})` },
                        ].map((f) => (
                          <button
                            key={f.id}
                            type="button"
                            onClick={() => setEntityFilter(f.id as AdminEntityFilter)}
                            className={`flex-1 py-1.5 px-2 rounded-lg text-[11px] font-mono transition ${
                              entityFilter === f.id
                                ? 'bg-amber-500 text-bunker-950 font-bold'
                                : 'text-zinc-400 hover:text-zinc-200'
                            }`}
                          >
                            {f.label}
                          </button>
                        ))}
                      </div>

                      {/* Sort dropdown */}
                      <div className="md:col-span-3 relative">
                        <ArrowUpDown className="w-4 h-4 text-amber-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <select
                          value={sortBy}
                          onChange={(e) => setSortBy(e.target.value as PackSortOption)}
                          className="w-full bg-bunker-900 border border-bunker-700 rounded-xl pl-9 pr-3 py-2.5 text-xs font-mono text-zinc-200 focus:outline-none focus:border-amber-500"
                        >
                          <option value="date">Сортировка: По дате</option>
                          <option value="alphabet">Сортировка: По алфавиту</option>
                          <option value="cardsCount">Сортировка: По кол-ву карт / размеру</option>
                        </select>
                      </div>
                    </div>

                    {/* Tag Filter Pills */}
                    {allAvailableTags.length > 0 && (
                      <div className="flex items-center gap-1.5 flex-wrap pt-1">
                        <span className="text-[11px] font-mono text-zinc-500 flex items-center gap-1 mr-1">
                          <Tag className="w-3.5 h-3.5 text-amber-400" /> Фильтр по тегам:
                        </span>
                        <button
                          type="button"
                          onClick={() => setSelectedTag('all')}
                          className={`px-2.5 py-1 rounded-lg text-xs font-mono transition ${
                            selectedTag === 'all'
                              ? 'bg-amber-500 text-bunker-950 font-bold'
                              : 'bg-bunker-900 text-zinc-400 border border-bunker-700 hover:text-zinc-200'
                          }`}
                        >
                          Все теги
                        </button>
                        {allAvailableTags.map((tag) => (
                          <button
                            key={tag}
                            type="button"
                            onClick={() =>
                              setSelectedTag(selectedTag === tag ? 'all' : tag)
                            }
                            className={`px-2.5 py-1 rounded-lg text-xs font-mono transition ${
                              selectedTag === tag
                                ? 'bg-amber-500 text-bunker-950 font-bold'
                                : 'bg-bunker-900 text-zinc-400 border border-bunker-700 hover:text-zinc-200'
                            }`}
                          >
                            #{tag}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* DETAILED CHARACTERISTIC PACK CARDS MODAL/DRAWER WHEN EDITING A PACK */}
                  {editingPack && (
                    <div className="p-5 rounded-2xl bg-bunker-950 border-2 border-amber-500/60 space-y-4">
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-bunker-800 pb-3">
                        <div>
                          <span className="text-[11px] font-mono uppercase text-amber-400">
                            Редактирование пака характеристик (11 категорий)
                          </span>
                          <h3 className="text-lg font-bold text-zinc-100">
                            {editingPack.name} ({getPackTotalCards(editingPack)} карт)
                          </h3>
                        </div>
                        <button
                          type="button"
                          onClick={() => setEditingPackId(null)}
                          className="px-3 py-1.5 rounded-lg bg-bunker-800 text-xs font-mono text-zinc-300 hover:text-white"
                        >
                          Свернуть редактор карт
                        </button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                        <input
                          type="text"
                          value={editingPack.name}
                          onChange={(e) =>
                            updateEditingPack((d) => {
                              d.name = e.target.value;
                              return d;
                            })
                          }
                          placeholder="Название пака..."
                          className="bg-bunker-900 border border-bunker-700 rounded-xl px-3 py-2 text-xs text-zinc-100"
                        />
                        <input
                          type="text"
                          value={editingPack.description}
                          onChange={(e) =>
                            updateEditingPack((d) => {
                              d.description = e.target.value;
                              return d;
                            })
                          }
                          placeholder="Описание пака..."
                          className="bg-bunker-900 border border-bunker-700 rounded-xl px-3 py-2 text-xs text-zinc-300"
                        />
                        <input
                          type="text"
                          value={(editingPack.tags || []).join(', ')}
                          onChange={(e) =>
                            updateEditingPack((d) => {
                              d.tags = e.target.value
                                .split(',')
                                .map((t) => t.trim())
                                .filter(Boolean);
                              return d;
                            })
                          }
                          placeholder="Теги через запятую (классика, медицина)..."
                          className="bg-bunker-900 border border-bunker-700 rounded-xl px-3 py-2 text-xs font-mono text-amber-300"
                        />
                      </div>

                      {/* 11 Category Pills */}
                      <div className="flex flex-wrap gap-1.5">
                        {ATTRIBUTE_METADATA.map((meta) => {
                          const count = editingPack.cards?.[meta.key]?.length || 0;
                          const isSelected = selectedAttrKey === meta.key;
                          return (
                            <button
                              key={meta.key}
                              type="button"
                              onClick={() => setSelectedAttrKey(meta.key)}
                              className={`px-2.5 py-1.5 rounded-lg text-xs font-mono border transition flex items-center gap-1.5 ${
                                isSelected
                                  ? 'bg-amber-500/20 border-amber-500 text-amber-300 font-semibold'
                                  : 'bg-bunker-900 border-bunker-700 text-zinc-400 hover:text-zinc-200'
                              }`}
                            >
                              <span>{meta.label}</span>
                              {meta.hasAbility && (
                                <span className="text-[10px] text-amber-400">⚡</span>
                              )}
                              <span className="text-[10px] px-1.5 py-0.2 rounded bg-bunker-800 text-zinc-300">
                                {count}
                              </span>
                            </button>
                          );
                        })}
                      </div>

                      {/* Add New Card Form */}
                      <form
                        onSubmit={handleAddCardToCategory}
                        className="p-3.5 rounded-xl bg-bunker-900 border border-bunker-700 space-y-3"
                      >
                        <div className="text-xs font-mono uppercase text-amber-400">
                          + Добавить карту в категорию «
                          {ATTRIBUTE_METADATA.find((m) => m.key === selectedAttrKey)?.label}»
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                          <div className="sm:col-span-2">
                            <input
                              type="text"
                              value={newCardText}
                              onChange={(e) => setNewCardText(e.target.value)}
                              placeholder="Текст карты..."
                              className="w-full bg-bunker-950 border border-bunker-700 rounded-lg px-3 py-2 text-xs text-zinc-100"
                              required
                            />
                          </div>
                          <div>
                            <input
                              type="text"
                              value={newCardCondition}
                              onChange={(e) => setNewCardCondition(e.target.value)}
                              placeholder="Условие / примечание..."
                              className="w-full bg-bunker-950 border border-bunker-700 rounded-lg px-3 py-2 text-xs text-zinc-300"
                            />
                          </div>
                          <div>
                            <select
                              value={newCardRarity}
                              onChange={(e) =>
                                setNewCardRarity(e.target.value as CardRarity)
                              }
                              className="w-full bg-bunker-950 border border-bunker-700 rounded-lg px-2.5 py-2 text-xs text-zinc-200"
                            >
                              <option value="common">Обычная (common)</option>
                              <option value="rare">Редкая (rare)</option>
                              <option value="epic">Эпическая (epic)</option>
                              <option value="legendary">Легендарная (legendary)</option>
                            </select>
                          </div>
                        </div>

                        {(selectedAttrKey === 'profession' ||
                          selectedAttrKey === 'hobby' ||
                          selectedAttrKey === 'specialCard') && (
                          <div className="p-3 rounded-lg bg-amber-500/5 border border-amber-500/30 space-y-2">
                            <div className="text-[11px] font-mono uppercase text-amber-400">
                              ⚡ Обязательная «Спец. способность»:
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                              <input
                                type="text"
                                value={newAbilityName}
                                onChange={(e) => setNewAbilityName(e.target.value)}
                                placeholder="Название способности..."
                                className="bg-bunker-950 border border-bunker-700 rounded-lg px-3 py-1.5 text-xs text-zinc-100"
                                required
                              />
                              <select
                                value={newAbilityType}
                                onChange={(e) =>
                                  setNewAbilityType(e.target.value as AbilityUsageType)
                                }
                                className="bg-bunker-950 border border-bunker-700 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200"
                              >
                                <option value="instant">Мгновенное</option>
                                <option value="voting">На голосовании</option>
                                <option value="passive">Пассивное</option>
                              </select>
                              <select
                                value={newAbilityEffect}
                                onChange={(e) =>
                                  setNewAbilityEffect(e.target.value as AbilityEffectType)
                                }
                                className="bg-bunker-950 border border-bunker-700 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200"
                              >
                                {EFFECT_TYPE_LABELS.map((ef) => (
                                  <option key={ef.value} value={ef.value}>
                                    {ef.label}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <input
                              type="text"
                              value={newAbilityDesc}
                              onChange={(e) => setNewAbilityDesc(e.target.value)}
                              placeholder="Подробное описание действия способности..."
                              className="w-full bg-bunker-950 border border-bunker-700 rounded-lg px-3 py-1.5 text-xs text-zinc-200"
                              required
                            />
                          </div>
                        )}

                        <button
                          type="submit"
                          className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-bunker-950 font-bold text-xs uppercase"
                        >
                          Добавить карту
                        </button>
                      </form>

                      {/* Cards list inside category */}
                      <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                        {(editingPack.cards?.[selectedAttrKey] || []).map((card) => (
                          <div
                            key={card.id}
                            className="p-2.5 rounded-xl bg-bunker-900 border border-bunker-800 flex items-start justify-between gap-2"
                          >
                            <div className="space-y-0.5">
                              <div className="text-xs font-semibold text-zinc-100">
                                {card.text}{' '}
                                <span className="text-[10px] font-mono text-amber-400">
                                  [{card.rarity}]
                                </span>
                              </div>
                              {card.ability && (
                                <div className="text-[11px] font-mono text-amber-300/90">
                                  ⚡ {card.ability.name}: {card.ability.description}
                                </div>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={() =>
                                updateEditingPack((d) => {
                                  d.cards[selectedAttrKey] = (
                                    d.cards[selectedAttrKey] || []
                                  ).filter((c) => c.id !== card.id);
                                  return d;
                                })
                              }
                              className="p-1 text-zinc-500 hover:text-red-400"
                              title="Удалить карту"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* SECTION A: ПАКИ ХАРАКТЕРИСТИК */}
                  {(entityFilter === 'all' || entityFilter === 'packs') && (
                    <div className="space-y-3">
                      <h3 className="text-xs font-mono uppercase tracking-wider text-amber-400 flex items-center gap-2">
                        <Layers className="w-4 h-4" />
                        Паки характеристик ({filteredPacks.length})
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {filteredPacks.map((pack) => {
                          const totalCards = getPackTotalCards(pack);
                          return (
                            <div
                              key={pack.id}
                              className="p-4 rounded-2xl bg-bunker-950 border border-bunker-700 flex flex-col justify-between gap-3"
                            >
                              <div className="space-y-1.5">
                                <div className="flex items-start justify-between gap-2">
                                  <h4 className="text-sm font-bold text-zinc-100">
                                    {pack.name}
                                  </h4>
                                  <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 shrink-0">
                                    {totalCards} карт
                                  </span>
                                </div>
                                <p className="text-xs text-zinc-400">
                                  {pack.description}
                                </p>
                                <div className="flex flex-wrap gap-1 pt-1">
                                  {(pack.tags || []).map((t) => (
                                    <span
                                      key={t}
                                      className="text-[10px] font-mono px-2 py-0.5 rounded bg-bunker-900 border border-bunker-800 text-zinc-400"
                                    >
                                      #{t}
                                    </span>
                                  ))}
                                </div>
                              </div>

                              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-bunker-800">
                                <div className="flex flex-wrap gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => setEditingPackId(pack.id)}
                                    className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-bunker-950 font-bold text-xs font-mono transition"
                                  >
                                    Редактировать карты
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleClonePack(pack)}
                                    className="px-2.5 py-1.5 rounded-lg bg-bunker-800 hover:bg-bunker-700 text-zinc-200 text-xs font-mono flex items-center gap-1"
                                  >
                                    <Copy className="w-3.5 h-3.5" /> Клон
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleExportPack(pack)}
                                    className="px-2.5 py-1.5 rounded-lg bg-bunker-800 hover:bg-bunker-700 text-zinc-200 text-xs font-mono flex items-center gap-1"
                                  >
                                    <Download className="w-3.5 h-3.5" /> JSON
                                  </button>
                                </div>

                                <button
                                  type="button"
                                  onClick={() =>
                                    setConfirmDelete({
                                      kind: 'pack',
                                      id: pack.id,
                                      title: pack.name,
                                    })
                                  }
                                  className="p-1.5 rounded-lg bg-red-500/15 border border-red-500/30 text-red-400 hover:bg-red-500/25"
                                  title="Безопасное удаление пака"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* SECTION B: СЦЕНАРИИ КАТАСТРОФ */}
                  {(entityFilter === 'all' || entityFilter === 'catastrophes') && (
                    <div className="space-y-3">
                      <h3 className="text-xs font-mono uppercase tracking-wider text-red-400 flex items-center gap-2">
                        <ShieldAlert className="w-4 h-4" />
                        Сценарии катастроф ({filteredCatastrophes.length})
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {filteredCatastrophes.map((cat) => (
                          <div
                            key={cat.id}
                            className="p-4 rounded-2xl bg-bunker-950 border border-bunker-700 space-y-2.5"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <input
                                type="text"
                                value={cat.title}
                                onChange={(e) => {
                                  const next = saveCatastrophePreset({
                                    ...cat,
                                    title: e.target.value,
                                  });
                                  setCatastrophes(next);
                                  onSettingsChanged();
                                }}
                                className="flex-1 bg-bunker-900 border border-bunker-700 rounded-lg px-3 py-1.5 text-xs font-bold text-red-300"
                              />
                              <select
                                value={cat.threatLevel || 'Критическая'}
                                onChange={(e) => {
                                  const next = saveCatastrophePreset({
                                    ...cat,
                                    threatLevel: e.target.value as CatastrophePreset['threatLevel'],
                                  });
                                  setCatastrophes(next);
                                }}
                                className="bg-bunker-900 border border-bunker-700 rounded-lg px-2 py-1.5 text-[11px] font-mono text-amber-300"
                              >
                                <option value="Средняя">Угроза: Средняя</option>
                                <option value="Высокая">Угроза: Высокая</option>
                                <option value="Критическая">Угроза: Критическая</option>
                                <option value="Экстремальная">Угроза: Экстремальная</option>
                              </select>
                              <button
                                type="button"
                                onClick={() =>
                                  setConfirmDelete({
                                    kind: 'catastrophe',
                                    id: cat.id,
                                    title: cat.title,
                                  })
                                }
                                className="p-1.5 rounded-lg bg-red-500/15 border border-red-500/30 text-red-400 hover:bg-red-500/25"
                                title="Безопасное удаление сценария катастрофы"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>

                            <textarea
                              rows={2}
                              value={cat.description}
                              onChange={(e) => {
                                const next = saveCatastrophePreset({
                                  ...cat,
                                  description: e.target.value,
                                });
                                setCatastrophes(next);
                                onSettingsChanged();
                              }}
                              className="w-full bg-bunker-900 border border-bunker-700 rounded-lg px-3 py-1.5 text-xs text-zinc-200"
                              placeholder="Полное описание катастрофы..."
                            />

                            <input
                              type="text"
                              value={cat.threats}
                              onChange={(e) => {
                                const next = saveCatastrophePreset({
                                  ...cat,
                                  threats: e.target.value,
                                });
                                setCatastrophes(next);
                                onSettingsChanged();
                              }}
                              className="w-full bg-bunker-900 border border-bunker-700 rounded-lg px-3 py-1.5 text-xs text-red-300"
                              placeholder="Угрозы на поверхности..."
                            />

                            <input
                              type="text"
                              value={(cat.tags || []).join(', ')}
                              onChange={(e) => {
                                const next = saveCatastrophePreset({
                                  ...cat,
                                  tags: e.target.value
                                    .split(',')
                                    .map((t) => t.trim())
                                    .filter(Boolean),
                                });
                                setCatastrophes(next);
                              }}
                              className="w-full bg-bunker-900 border border-bunker-800 rounded-lg px-3 py-1 text-[11px] font-mono text-zinc-400"
                              placeholder="Теги через запятую..."
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* SECTION C: ПРЕСЕТЫ БУНКЕРА */}
                  {(entityFilter === 'all' || entityFilter === 'bunkers') && (
                    <div className="space-y-3">
                      <h3 className="text-xs font-mono uppercase tracking-wider text-emerald-400 flex items-center gap-2">
                        <Home className="w-4 h-4" />
                        Пресеты бункера ({filteredBunkers.length})
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {filteredBunkers.map((bunk) => (
                          <div
                            key={bunk.id}
                            className="p-4 rounded-2xl bg-bunker-950 border border-bunker-700 space-y-2.5"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <input
                                type="text"
                                value={bunk.name}
                                onChange={(e) => {
                                  const next = saveBunkerPreset({
                                    ...bunk,
                                    name: e.target.value,
                                  });
                                  setBunkers(next);
                                  onSettingsChanged();
                                }}
                                className="flex-1 bg-bunker-900 border border-bunker-700 rounded-lg px-3 py-1.5 text-xs font-bold text-emerald-300"
                              />
                              <button
                                type="button"
                                onClick={() =>
                                  setConfirmDelete({
                                    kind: 'bunker',
                                    id: bunk.id,
                                    title: bunk.name,
                                  })
                                }
                                className="p-1.5 rounded-lg bg-red-500/15 border border-red-500/30 text-red-400 hover:bg-red-500/25"
                                title="Безопасное удаление пресета бункера"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <span className="text-[10px] font-mono text-zinc-500 block">
                                  Размер (кв. м):
                                </span>
                                <input
                                  type="number"
                                  value={bunk.size}
                                  onChange={(e) => {
                                    const next = saveBunkerPreset({
                                      ...bunk,
                                      size: Number(e.target.value) || 100,
                                    });
                                    setBunkers(next);
                                    onSettingsChanged();
                                  }}
                                  className="w-full bg-bunker-900 border border-bunker-700 rounded-lg px-3 py-1.5 text-xs text-zinc-200"
                                />
                              </div>
                              <div>
                                <span className="text-[10px] font-mono text-zinc-500 block">
                                  Время изоляции:
                                </span>
                                <input
                                  type="text"
                                  value={bunk.duration}
                                  onChange={(e) => {
                                    const next = saveBunkerPreset({
                                      ...bunk,
                                      duration: e.target.value,
                                    });
                                    setBunkers(next);
                                    onSettingsChanged();
                                  }}
                                  className="w-full bg-bunker-900 border border-bunker-700 rounded-lg px-3 py-1.5 text-xs text-zinc-200"
                                />
                              </div>
                            </div>

                            <textarea
                              rows={2}
                              value={bunk.supplies}
                              onChange={(e) => {
                                const next = saveBunkerPreset({
                                  ...bunk,
                                  supplies: e.target.value,
                                });
                                setBunkers(next);
                                onSettingsChanged();
                              }}
                              className="w-full bg-bunker-900 border border-bunker-700 rounded-lg px-3 py-1.5 text-xs text-zinc-200"
                              placeholder="Список базовых запасов и оборудования..."
                            />

                            <input
                              type="text"
                              value={(bunk.tags || []).join(', ')}
                              onChange={(e) => {
                                const next = saveBunkerPreset({
                                  ...bunk,
                                  tags: e.target.value
                                    .split(',')
                                    .map((t) => t.trim())
                                    .filter(Boolean),
                                });
                                setBunkers(next);
                              }}
                              className="w-full bg-bunker-900 border border-bunker-800 rounded-lg px-3 py-1 text-[11px] font-mono text-zinc-400"
                              placeholder="Теги через запятую..."
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* =============================================================== */}
              {/* TAB 2: УПРАВЛЕНИЕ АКТИВНЫМИ КОМНАТАМИ И ОЧИСТКА (Section 2.4)    */}
              {/* =============================================================== */}
              {activeTab === 'rooms' && (
                <div className="space-y-4">
                  <div className="p-4 rounded-2xl bg-bunker-950 border border-bunker-700 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-bold text-amber-400 font-mono">
                        Активные сессии и автоочистка базы
                      </h3>
                      <p className="text-xs text-zinc-400">
                        Неактивные комнаты старше 24 часов и завершённые игры автоматически удаляются из Firebase и локального хранилища.
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={refreshActiveRooms}
                        className="px-3.5 py-2 rounded-xl bg-bunker-800 hover:bg-bunker-700 text-zinc-200 text-xs font-mono flex items-center gap-1.5"
                      >
                        <RefreshCw
                          className={`w-3.5 h-3.5 ${loadingRooms ? 'animate-spin' : ''}`}
                        />
                        Обновить список
                      </button>
                    </div>
                  </div>

                  {activeRooms.length === 0 ? (
                    <div className="p-8 rounded-2xl bg-bunker-950 border border-bunker-800 text-center text-xs font-mono text-zinc-500">
                      Нет активных сессий в базе данных.
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {activeRooms.map((r) => {
                        const playersArr = Object.values(r.players || {});
                        const hostName =
                          r.players?.[r.hostId]?.name ||
                          playersArr.find((p) => p.isHost)?.name ||
                          'Неизвестен';
                        const updatedTime = new Date(
                          r.updatedAt || r.createdAt || Date.now()
                        ).toLocaleString('ru-RU');

                        return (
                          <div
                            key={r.code}
                            className="p-4 rounded-2xl bg-bunker-950 border border-bunker-700 flex flex-wrap items-center justify-between gap-3"
                          >
                            <div className="space-y-1">
                              <div className="flex items-center gap-2.5 flex-wrap">
                                <span className="px-2.5 py-1 rounded-lg bg-amber-500/20 border border-amber-500/40 font-mono font-bold text-sm text-amber-300">
                                  #{r.code}
                                </span>
                                <span className="text-xs font-mono px-2 py-0.5 rounded bg-bunker-800 text-emerald-300">
                                  Статус: {r.status}
                                </span>
                                <span className="text-xs text-zinc-300">
                                  Хост: <strong>{hostName}</strong>
                                </span>
                                <span className="text-xs text-zinc-400">
                                  Игроков: <strong>{playersArr.length}</strong> (мест:{' '}
                                  {r.settings?.capacity || 1})
                                </span>
                              </div>
                              <div className="text-[11px] font-mono text-zinc-500">
                                Обновлено: {updatedTime} • Паки:{' '}
                                {(r.settings?.packNames || []).join(', ') || 'Базовый'}
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={() =>
                                setConfirmDelete({
                                  kind: 'room',
                                  id: r.code,
                                  title: `Комната #${r.code} (Хост: ${hostName})`,
                                })
                              }
                              className="px-3.5 py-2 rounded-xl bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 text-red-300 text-xs font-mono font-bold flex items-center gap-1.5 transition"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              Завершить и удалить комнату
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* =============================================================== */}
              {/* TAB 3: КОНФИГУРАТОР FIREBASE                                     */}
              {/* =============================================================== */}
              {activeTab === 'firebase' && (
                <div className="space-y-4">
                  <div className="p-4 rounded-xl bg-bunker-950 border border-bunker-700 space-y-2">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <span className="text-xs font-mono uppercase text-amber-400">
                        Текущий режим синхронизации комнат:
                      </span>
                      <span className="text-xs font-mono px-2.5 py-1 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                        {getSyncMode() === 'firebase-rtdb'
                          ? 'Firebase Realtime Database (Онлайн)'
                          : getSyncMode() === 'firebase-firestore'
                          ? 'Firebase Cloud Firestore (Онлайн)'
                          : 'Автономный мульти-вкладочный режим (BroadcastChannel)'}
                      </span>
                    </div>
                    <p className="text-xs text-zinc-400 leading-relaxed">
                      Вставьте стандартный JSON-объект конфигурации Firebase или блок{' '}
                      <code className="text-amber-300">
                        const firebaseConfig = &#123; ... &#125;
                      </code>{' '}
                      из консоли Firebase. Конфигурация сохраняется в{' '}
                      <code className="text-amber-300">localStorage</code> браузера.
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-mono uppercase text-zinc-300 mb-2">
                      JSON-конфигурация Firebase:
                    </label>
                    <textarea
                      rows={9}
                      value={fbText}
                      onChange={(e) => setFbText(e.target.value)}
                      placeholder={`{\n  "apiKey": "AIzaSy...",\n  "authDomain": "your-app.firebaseapp.com",\n  "databaseURL": "https://your-app-default-rtdb.firebaseio.com",\n  "projectId": "your-app",\n  "storageBucket": "your-app.appspot.com",\n  "messagingSenderId": "123456789",\n  "appId": "1:123456789:web:abcdef"\n}`}
                      className="w-full bg-bunker-950 border border-bunker-600 rounded-xl p-3.5 text-xs font-mono text-emerald-300 focus:outline-none focus:border-amber-500"
                    />
                  </div>

                  {fbStatus.type !== 'idle' && (
                    <div
                      className={`p-3.5 rounded-xl border text-xs flex items-start gap-2.5 ${
                        fbStatus.type === 'success'
                          ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-200'
                          : fbStatus.type === 'error'
                          ? 'bg-red-500/15 border-red-500/40 text-red-200'
                          : 'bg-amber-500/15 border-amber-500/40 text-amber-200'
                      }`}
                    >
                      {fbStatus.type === 'success' ? (
                        <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                      ) : (
                        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                      )}
                      <span>{fbStatus.message}</span>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={handleSaveAndTestFirebase}
                      className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-bunker-950 font-bold text-xs uppercase tracking-wider transition flex items-center gap-2"
                    >
                      <Save className="w-4 h-4" />
                      Сохранить и проверить подключение
                    </button>
                    <button
                      type="button"
                      onClick={handleClearFirebase}
                      className="px-4 py-2.5 rounded-xl bg-bunker-800 hover:bg-bunker-700 text-zinc-300 text-xs font-mono transition"
                    >
                      Сбросить на локальный режим
                    </button>
                  </div>
                </div>
              )}

              {/* =============================================================== */}
              {/* TAB 4: СМЕНА ПАРОЛЯ АДМИНИСТРАТОРА                               */}
              {/* =============================================================== */}
              {activeTab === 'security' && (
                <div className="space-y-4 max-w-md">
                  <div className="p-4 rounded-xl bg-bunker-950 border border-bunker-700 space-y-3">
                    <h4 className="text-sm font-bold text-amber-400 font-mono">
                      Смена мастер-пароля администратора (/admin)
                    </h4>
                    <input
                      type="password"
                      value={newAdminPwd}
                      onChange={(e) => setNewAdminPwd(e.target.value)}
                      placeholder="Новый мастер-пароль..."
                      className="w-full bg-bunker-900 border border-bunker-600 rounded-xl px-3.5 py-2.5 text-sm text-zinc-100"
                    />
                    {pwdSavedMsg && (
                      <div className="text-xs text-emerald-400 font-mono">
                        {pwdSavedMsg}
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        if (!newAdminPwd.trim()) return;
                        setAdminPassword(newAdminPwd);
                        setNewAdminPwd('');
                        setPwdSavedMsg('Мастер-пароль успешно обновлён!');
                      }}
                      className="px-4 py-2 rounded-xl bg-amber-500 text-bunker-950 font-bold text-xs uppercase"
                    >
                      Обновить пароль
                    </button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* SAFE DELETE CONFIRMATION MODAL (Section 2.3 & 2.4) */}
      {confirmDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          onClick={() => setConfirmDelete(null)}
        >
          <div
            className="max-w-md w-full bg-bunker-900 border-2 border-red-500 rounded-2xl p-6 space-y-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 text-red-400">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <h4 className="text-base font-bold text-zinc-100">
                Подтверждение удаления
              </h4>
            </div>
            <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed">
              Вы действительно хотите безвозвратно удалить{' '}
              <strong className="text-amber-300">«{confirmDelete.title}»</strong> из базы данных и локального хранилища?
            </p>
            <div className="flex justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setConfirmDelete(null)}
                className="px-4 py-2 rounded-xl bg-bunker-800 hover:bg-bunker-700 text-zinc-200 text-xs font-mono"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={executeConfirmedDelete}
                className="px-4 py-2 rounded-xl bg-red-500 hover:bg-red-400 text-white font-bold text-xs font-mono uppercase"
              >
                Подтвердить удаление
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
