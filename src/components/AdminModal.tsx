import React, { useState, useRef } from 'react';
import {
  X,
  Lock,
  Database,
  Sparkles,
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
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import {
  ATTRIBUTE_METADATA,
  AbilityEffectType,
  AbilityUsageType,
  AttributeKey,
  BunkerPreset,
  CardRarity,
  CatastrophePreset,
  GamePack,
  PackCardItem,
} from '../types/game';
import {
  deleteCustomPack,
  getActivePackId,
  getAllPacks,
  getFirebaseConfig,
  getGeminiApiKey,
  getGeminiModel,
  hasAdminPassword,
  parseFirebaseConfigInput,
  saveCustomPack,
  saveFirebaseConfig,
  saveGeminiApiKey,
  saveGeminiModel,
  setActivePackId,
  setAdminPassword,
  verifyAdminPassword,
} from '../services/storageService';
import {
  getSyncMode,
  initFirebaseFromStorage,
  testFirebaseConnection,
} from '../services/firebaseService';
import { testGeminiApiKey } from '../services/geminiService';

interface AdminModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSettingsChanged: () => void;
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

export const AdminModal: React.FC<AdminModalProps> = ({
  isOpen,
  onClose,
  onSettingsChanged,
}) => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [passwordInput, setPasswordInput] = useState<string>('');
  const [authError, setAuthError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<'firebase' | 'gemini' | 'packs' | 'security'>(
    'firebase'
  );

  // Firebase state
  const existingFbConfig = getFirebaseConfig();
  const [fbText, setFbText] = useState<string>(
    existingFbConfig ? JSON.stringify(existingFbConfig, null, 2) : ''
  );
  const [fbStatus, setFbStatus] = useState<{
    type: 'idle' | 'loading' | 'success' | 'error';
    message: string;
  }>({ type: 'idle', message: '' });

  // Gemini state
  const [geminiKey, setGeminiKey] = useState<string>(getGeminiApiKey());
  const [geminiModel, setGeminiModel] = useState<string>(getGeminiModel());
  const [geminiStatus, setGeminiStatus] = useState<{
    type: 'idle' | 'loading' | 'success' | 'error';
    message: string;
  }>({ type: 'idle', message: '' });

  // Pack editor state
  const [packs, setPacks] = useState<GamePack[]>(getAllPacks());
  const [selectedPackId, setSelectedPackId] = useState<string>(getActivePackId());
  const [packSubTab, setPackSubTab] = useState<'catastrophes' | 'bunkers' | 'cards'>('cards');
  const [selectedAttrKey, setSelectedAttrKey] = useState<AttributeKey>('profession');
  const [packNotice, setPackNotice] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // New card form state
  const [newCardText, setNewCardText] = useState('');
  const [newCardCondition, setNewCardCondition] = useState('');
  const [newCardRarity, setNewCardRarity] = useState<CardRarity>('common');
  const [newAbilityName, setNewAbilityName] = useState('');
  const [newAbilityDesc, setNewAbilityDesc] = useState('');
  const [newAbilityType, setNewAbilityType] = useState<AbilityUsageType>('instant');
  const [newAbilityEffect, setNewAbilityEffect] = useState<AbilityEffectType>('force_reveal');

  // Security password change
  const [newAdminPwd, setNewAdminPwd] = useState('');
  const [pwdSavedMsg, setPwdSavedMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const isFirstInit = !hasAdminPassword();

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
    } else {
      if (verifyAdminPassword(passwordInput)) {
        setIsAuthenticated(true);
        setPasswordInput('');
      } else {
        setAuthError('Неверный мастер-пароль администратора');
      }
    }
  };

  const currentPack =
    packs.find((p) => p.id === selectedPackId) || packs[0];

  const handleSaveAndTestFirebase = async () => {
    setFbStatus({ type: 'loading', message: 'Проверка конфигурации и подключение к Firebase...' });
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

  const handleSaveAndTestGemini = async () => {
    saveGeminiApiKey(geminiKey);
    saveGeminiModel(geminiModel);
    onSettingsChanged();
    setGeminiStatus({
      type: 'loading',
      message: 'Отправка тестового запроса к Google Gemini REST API...',
    });
    const res = await testGeminiApiKey(geminiKey, geminiModel);
    if (res.ok && res.modelUsed) {
      setGeminiModel(res.modelUsed);
      saveGeminiModel(res.modelUsed);
    }
    setGeminiStatus({
      type: res.ok ? 'success' : 'error',
      message: res.message,
    });
  };

  const updateCurrentPack = (updater: (draft: GamePack) => GamePack) => {
    const clone: GamePack = JSON.parse(JSON.stringify(currentPack));
    const updated = updater(clone);
    const nextPacks = saveCustomPack(updated);
    setPacks(nextPacks);
    onSettingsChanged();
  };

  const handleClonePack = () => {
    const cloned: GamePack = JSON.parse(JSON.stringify(currentPack));
    cloned.id = `pack_${Date.now()}`;
    cloned.name = `${currentPack.name} (Копия)`;
    cloned.isBuiltIn = false;
    const nextPacks = saveCustomPack(cloned);
    setPacks(nextPacks);
    setSelectedPackId(cloned.id);
    setActivePackId(cloned.id);
    onSettingsChanged();
    setPackNotice(`Пак «${cloned.name}» создан и выбран активным.`);
  };

  const handleCreateEmptyPack = () => {
    const newPack: GamePack = {
      id: `custom_pack_${Date.now()}`,
      name: 'Новый авторский пак «Бункер»',
      description: 'Пользовательский набор сценариев, бункеров и карт характеристик.',
      version: '1.0.0',
      isBuiltIn: false,
      catastrophes: [
        {
          id: `cat_${Date.now()}`,
          title: 'Неизвестная глобальная катастрофа',
          description: 'Поверхность планеты непригодна для жизни на ближайшие годы.',
          threats: 'Экстремальная температура, дефицит чистой воды.',
        },
      ],
      bunkers: [
        {
          id: `bunk_${Date.now()}`,
          name: 'Автономное убежище №1',
          size: 120,
          duration: '3 года',
          supplies: 'Система фильтрации воздуха, запас сухпайков на 2 года, генератор.',
        },
      ],
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
    const nextPacks = saveCustomPack(newPack);
    setPacks(nextPacks);
    setSelectedPackId(newPack.id);
    setActivePackId(newPack.id);
    onSettingsChanged();
    setPackNotice('Создан новый пак! Недостающие категории автоматически дополняются базовой колодой.');
  };

  const handleExportPack = () => {
    const dataStr =
      'data:text/json;charset=utf-8,' +
      encodeURIComponent(JSON.stringify(currentPack, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `${currentPack.id}.json`);
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
        parsed.isBuiltIn = false;
        const nextPacks = saveCustomPack(parsed);
        setPacks(nextPacks);
        setSelectedPackId(parsed.id);
        setActivePackId(parsed.id);
        onSettingsChanged();
        setPackNotice(`Пак «${parsed.name}» успешно импортирован!`);
      } catch (err) {
        alert(
          'Ошибка импорта JSON: ' + (err instanceof Error ? err.message : String(err))
        );
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleAddCardToCategory = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCardText.trim()) return;

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

    updateCurrentPack((draft) => {
      draft.cards[selectedAttrKey] = [newItem, ...(draft.cards[selectedAttrKey] || [])];
      return draft;
    });

    setNewCardText('');
    setNewCardCondition('');
    setNewAbilityName('');
    setNewAbilityDesc('');
    setPackNotice('Карта успешно добавлена в пак и сохранена!');
  };

  const handleDeleteCard = (cardId: string) => {
    updateCurrentPack((draft) => {
      draft.cards[selectedAttrKey] = (draft.cards[selectedAttrKey] || []).filter(
        (c) => c.id !== cardId
      );
      return draft;
    });
  };

  const handleAddCatastrophe = () => {
    const newCat: CatastrophePreset = {
      id: `cat_${Date.now()}`,
      title: 'Новый сценарий катастрофы',
      description: 'Опишите условия внешнего мира и причину глобальной катастрофы...',
      threats: 'Радиация, токсичная пыль, экстремальный холод',
    };
    updateCurrentPack((draft) => {
      draft.catastrophes = [newCat, ...(draft.catastrophes || [])];
      return draft;
    });
  };

  const handleAddBunkerPreset = () => {
    const newBunk: BunkerPreset = {
      id: `bunk_${Date.now()}`,
      name: 'Новый пресет бункера',
      size: 120,
      duration: '3 года',
      supplies: 'Генератор, система очистки воды, запас консервов на 2 года, аптечка',
    };
    updateCurrentPack((draft) => {
      draft.bunkers = [newBunk, ...(draft.bunkers || [])];
      return draft;
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-2 sm:p-4 overflow-y-auto">
      <div className="w-full max-w-4xl bg-bunker-900 border-2 border-bunker-600 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-bunker-700 bg-bunker-950">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-amber-500/15 border border-amber-500/40 flex items-center justify-center text-amber-400">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-zinc-100 font-mono tracking-wide">
                ТЕРМИНАЛ АДМИНИСТРАТОРА // НАСТРОЙКИ И КОНСТРУКТОР ПАКОВ
              </h2>
              <p className="text-xs text-zinc-400">
                Все ключи сохраняются локально в вашем браузере (localStorage) и не попадают в публичный репозиторий
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-bunker-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Auth Gate */}
        {!isAuthenticated ? (
          <form onSubmit={handleLoginSubmit} className="p-6 sm:p-10 max-w-md mx-auto w-full space-y-5">
            <div className="text-center space-y-2">
              <div className="w-14 h-14 rounded-2xl bg-amber-500/15 border border-amber-500/40 flex items-center justify-center text-amber-400 mx-auto">
                <Lock className="w-7 h-7" />
              </div>
              <h3 className="text-xl font-bold text-zinc-100">
                {isFirstInit ? 'Первичная инициализация пароля' : 'Вход в панель администратора'}
              </h3>
              <p className="text-xs text-zinc-400 leading-relaxed">
                {isFirstInit
                  ? 'Задайте мастер-пароль администратора для доступа к конфигуратору Firebase, ключу Gemini API и редактору паков.'
                  : 'Введите мастер-пароль администратора, заданный при инициализации.'}
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
                placeholder={isFirstInit ? 'Придумайте мастер-пароль...' : 'Введите пароль...'}
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
              {isFirstInit ? 'Задать пароль и открыть терминал' : 'Авторизоваться'}
            </button>
          </form>
        ) : (
          <>
            {/* Navigation Tabs */}
            <div className="flex border-b border-bunker-700 bg-bunker-950/60 px-4 overflow-x-auto">
              <button
                onClick={() => setActiveTab('firebase')}
                className={`flex items-center gap-2 px-4 py-3 text-xs sm:text-sm font-mono border-b-2 transition whitespace-nowrap ${
                  activeTab === 'firebase'
                    ? 'border-amber-500 text-amber-400 font-semibold'
                    : 'border-transparent text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Database className="w-4 h-4" />
                1. Firebase
              </button>
              <button
                onClick={() => setActiveTab('gemini')}
                className={`flex items-center gap-2 px-4 py-3 text-xs sm:text-sm font-mono border-b-2 transition whitespace-nowrap ${
                  activeTab === 'gemini'
                    ? 'border-amber-500 text-amber-400 font-semibold'
                    : 'border-transparent text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Sparkles className="w-4 h-4" />
                2. Gemini AI
              </button>
              <button
                onClick={() => setActiveTab('packs')}
                className={`flex items-center gap-2 px-4 py-3 text-xs sm:text-sm font-mono border-b-2 transition whitespace-nowrap ${
                  activeTab === 'packs'
                    ? 'border-amber-500 text-amber-400 font-semibold'
                    : 'border-transparent text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Package className="w-4 h-4" />
                3. Конструктор паков (11 категорий)
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
                4. Пароль
              </button>
            </div>

            {/* Content Area */}
            <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-5">
              {/* TAB 1: FIREBASE CONFIGURATOR */}
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
                      Вставьте стандартный JSON-объект конфигурации Firebase или скопируйте блок{' '}
                      <code className="text-amber-300">const firebaseConfig = &#123; ... &#125;</code> прямо из консоли Firebase. При наличии поля{' '}
                      <code className="text-amber-300">databaseURL</code> используется Realtime Database, иначе — Firestore.
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

              {/* TAB 2: GEMINI API SETUP */}
              {activeTab === 'gemini' && (
                <div className="space-y-4">
                  <div className="p-4 rounded-xl bg-bunker-950 border border-bunker-700 space-y-1.5">
                    <h4 className="text-sm font-bold text-amber-400 font-mono">
                      Настройка ИИ-модуля финала (Google Gemini REST API)
                    </h4>
                    <p className="text-xs text-zinc-400 leading-relaxed">
                      Ключ используется напрямую с клиентской стороны для генерации художественного эпилога, расчёта вероятности выживания колонии (0–100%) и хронологии кризисов в бункере.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-mono uppercase text-zinc-300 mb-1.5">
                        Gemini API Key:
                      </label>
                      <input
                        type="password"
                        value={geminiKey}
                        onChange={(e) => setGeminiKey(e.target.value)}
                        placeholder="AIzaSy..."
                        className="w-full bg-bunker-950 border border-bunker-600 rounded-xl px-3.5 py-2.5 text-sm font-mono text-zinc-100 focus:outline-none focus:border-amber-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-mono uppercase text-zinc-300 mb-1.5">
                        Модель Gemini:
                      </label>
                      <select
                        value={geminiModel}
                        onChange={(e) => setGeminiModel(e.target.value)}
                        className="w-full bg-bunker-950 border border-bunker-600 rounded-xl px-3 py-2.5 text-sm font-mono text-zinc-100 focus:outline-none focus:border-amber-500"
                      >
                        <option value="gemini-2.5-flash">gemini-2.5-flash (Рекомендуется)</option>
                        <option value="gemini-2.0-flash">gemini-2.0-flash</option>
                        <option value="gemini-1.5-flash">gemini-1.5-flash</option>
                        <option value="gemini-1.5-pro">gemini-1.5-pro</option>
                      </select>
                    </div>
                  </div>

                  {geminiStatus.type !== 'idle' && (
                    <div
                      className={`p-3.5 rounded-xl border text-xs flex items-start gap-2.5 ${
                        geminiStatus.type === 'success'
                          ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-200'
                          : geminiStatus.type === 'error'
                          ? 'bg-red-500/15 border-red-500/40 text-red-200'
                          : 'bg-amber-500/15 border-amber-500/40 text-amber-200'
                      }`}
                    >
                      {geminiStatus.type === 'success' ? (
                        <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                      ) : (
                        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                      )}
                      <span>{geminiStatus.message}</span>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={handleSaveAndTestGemini}
                      className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-bunker-950 font-bold text-xs uppercase tracking-wider transition flex items-center gap-2"
                    >
                      <RefreshCw className="w-4 h-4" />
                      Сохранить и проверить ключ тестовым запросом
                    </button>
                  </div>
                </div>
              )}

              {/* TAB 3: PACK BUILDER & EDITOR */}
              {activeTab === 'packs' && currentPack && (
                <div className="space-y-4">
                  {/* Pack selector & toolbar */}
                  <div className="p-4 rounded-xl bg-bunker-950 border border-bunker-700 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex-1 min-w-[220px]">
                        <label className="block text-[11px] font-mono uppercase text-zinc-400 mb-1">
                          Редактируемый / Активный пак:
                        </label>
                        <select
                          value={selectedPackId}
                          onChange={(e) => {
                            setSelectedPackId(e.target.value);
                            setActivePackId(e.target.value);
                            onSettingsChanged();
                          }}
                          className="w-full bg-bunker-900 border border-bunker-600 rounded-xl px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-amber-500"
                        >
                          {packs.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name} ({p.isBuiltIn ? 'Базовый' : 'Пользовательский'})
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 pt-4">
                        <button
                          type="button"
                          onClick={handleCreateEmptyPack}
                          className="px-3 py-2 rounded-lg bg-amber-500/20 border border-amber-500/40 text-amber-300 hover:bg-amber-500/30 text-xs font-mono flex items-center gap-1.5"
                        >
                          <Plus className="w-3.5 h-3.5" /> Новый
                        </button>
                        <button
                          type="button"
                          onClick={handleClonePack}
                          className="px-3 py-2 rounded-lg bg-bunker-800 border border-bunker-600 text-zinc-200 hover:bg-bunker-700 text-xs font-mono flex items-center gap-1.5"
                        >
                          <Copy className="w-3.5 h-3.5" /> Клонировать
                        </button>
                        <button
                          type="button"
                          onClick={handleExportPack}
                          className="px-3 py-2 rounded-lg bg-bunker-800 border border-bunker-600 text-zinc-200 hover:bg-bunker-700 text-xs font-mono flex items-center gap-1.5"
                        >
                          <Download className="w-3.5 h-3.5" /> Экспорт JSON
                        </button>
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="px-3 py-2 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/30 text-xs font-mono flex items-center gap-1.5"
                        >
                          <Upload className="w-3.5 h-3.5" /> Импорт JSON
                        </button>
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept=".json,application/json"
                          onChange={handleImportPackFile}
                          className="hidden"
                        />
                        {!currentPack.isBuiltIn && (
                          <button
                            type="button"
                            onClick={() => {
                              const next = deleteCustomPack(currentPack.id);
                              setPacks(next);
                              setSelectedPackId(next[0].id);
                              setActivePackId(next[0].id);
                              onSettingsChanged();
                            }}
                            className="p-2 rounded-lg bg-red-500/15 border border-red-500/30 text-red-400 hover:bg-red-500/25"
                            title="Удалить пользовательский пак"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Pack Name & Description edit */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                      <input
                        type="text"
                        value={currentPack.name}
                        onChange={(e) =>
                          updateCurrentPack((d) => {
                            d.name = e.target.value;
                            return d;
                          })
                        }
                        placeholder="Название пака..."
                        className="bg-bunker-900 border border-bunker-700 rounded-lg px-3 py-1.5 text-xs text-zinc-200"
                      />
                      <input
                        type="text"
                        value={currentPack.description}
                        onChange={(e) =>
                          updateCurrentPack((d) => {
                            d.description = e.target.value;
                            return d;
                          })
                        }
                        placeholder="Описание пака..."
                        className="bg-bunker-900 border border-bunker-700 rounded-lg px-3 py-1.5 text-xs text-zinc-400"
                      />
                    </div>

                    {packNotice && (
                      <div className="text-xs text-emerald-300 font-mono bg-emerald-500/10 border border-emerald-500/30 px-3 py-1.5 rounded-lg">
                        ✓ {packNotice}
                      </div>
                    )}
                  </div>

                  {/* Sub-tabs inside pack: Cards (11 categories), Catastrophes, Bunkers */}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setPackSubTab('cards')}
                      className={`px-3.5 py-2 rounded-xl text-xs font-mono transition ${
                        packSubTab === 'cards'
                          ? 'bg-amber-500 text-bunker-950 font-bold'
                          : 'bg-bunker-950 text-zinc-400 border border-bunker-700'
                      }`}
                    >
                      Карты 11 характеристик
                    </button>
                    <button
                      type="button"
                      onClick={() => setPackSubTab('catastrophes')}
                      className={`px-3.5 py-2 rounded-xl text-xs font-mono transition ${
                        packSubTab === 'catastrophes'
                          ? 'bg-amber-500 text-bunker-950 font-bold'
                          : 'bg-bunker-950 text-zinc-400 border border-bunker-700'
                      }`}
                    >
                      Сценарии катастрофы ({currentPack.catastrophes?.length || 0})
                    </button>
                    <button
                      type="button"
                      onClick={() => setPackSubTab('bunkers')}
                      className={`px-3.5 py-2 rounded-xl text-xs font-mono transition ${
                        packSubTab === 'bunkers'
                          ? 'bg-amber-500 text-bunker-950 font-bold'
                          : 'bg-bunker-950 text-zinc-400 border border-bunker-700'
                      }`}
                    >
                      Пресеты бункера ({currentPack.bunkers?.length || 0})
                    </button>
                  </div>

                  {/* SUBTAB: CARDS FOR ALL 11 CATEGORIES */}
                  {packSubTab === 'cards' && (
                    <div className="space-y-4">
                      {/* 11 Category Pills */}
                      <div className="flex flex-wrap gap-1.5">
                        {ATTRIBUTE_METADATA.map((meta) => {
                          const count = currentPack.cards?.[meta.key]?.length || 0;
                          const isSelected = selectedAttrKey === meta.key;
                          return (
                            <button
                              key={meta.key}
                              type="button"
                              onClick={() => setSelectedAttrKey(meta.key)}
                              className={`px-2.5 py-1.5 rounded-lg text-xs font-mono border transition flex items-center gap-1.5 ${
                                isSelected
                                  ? 'bg-amber-500/20 border-amber-500 text-amber-300 font-semibold'
                                  : 'bg-bunker-950 border-bunker-700 text-zinc-400 hover:text-zinc-200'
                              }`}
                            >
                              <span>{meta.label}</span>
                              {meta.hasAbility && (
                                <span className="text-[10px] text-amber-400" title="Обязательная спец. способность">
                                  ⚡
                                </span>
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
                        className="p-4 rounded-xl bg-bunker-950 border border-bunker-700 space-y-3"
                      >
                        <div className="text-xs font-mono uppercase text-amber-400">
                          + Добавить карту в категорию «
                          {ATTRIBUTE_METADATA.find((m) => m.key === selectedAttrKey)?.label}»
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
                          <div className="sm:col-span-2">
                            <input
                              type="text"
                              value={newCardText}
                              onChange={(e) => setNewCardText(e.target.value)}
                              placeholder="Текст карты (например: Инженер систем жизнеобеспечения)..."
                              className="w-full bg-bunker-900 border border-bunker-700 rounded-lg px-3 py-2 text-xs text-zinc-100"
                              required
                            />
                          </div>
                          <div>
                            <input
                              type="text"
                              value={newCardCondition}
                              onChange={(e) => setNewCardCondition(e.target.value)}
                              placeholder="Условие / примечание..."
                              className="w-full bg-bunker-900 border border-bunker-700 rounded-lg px-3 py-2 text-xs text-zinc-300"
                            />
                          </div>
                          <div>
                            <select
                              value={newCardRarity}
                              onChange={(e) => setNewCardRarity(e.target.value as CardRarity)}
                              className="w-full bg-bunker-900 border border-bunker-700 rounded-lg px-2.5 py-2 text-xs text-zinc-200"
                            >
                              <option value="common">Обычная (common)</option>
                              <option value="rare">Редкая (rare)</option>
                              <option value="epic">Эпическая (epic)</option>
                              <option value="legendary">Легендарная (legendary)</option>
                            </select>
                          </div>
                        </div>

                        {/* Mandatory Special Ability fields for Profession, Hobby & Special Card */}
                        {(selectedAttrKey === 'profession' ||
                          selectedAttrKey === 'hobby' ||
                          selectedAttrKey === 'specialCard') && (
                          <div className="p-3 rounded-lg bg-amber-500/5 border border-amber-500/30 space-y-2.5">
                            <div className="text-[11px] font-mono uppercase text-amber-400">
                              ⚡ Обязательное поле «Спец. способность» (для {selectedAttrKey}):
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                              <input
                                type="text"
                                value={newAbilityName}
                                onChange={(e) => setNewAbilityName(e.target.value)}
                                placeholder="Название способности..."
                                className="bg-bunker-900 border border-bunker-700 rounded-lg px-3 py-1.5 text-xs text-zinc-100"
                                required
                              />
                              <select
                                value={newAbilityType}
                                onChange={(e) =>
                                  setNewAbilityType(e.target.value as AbilityUsageType)
                                }
                                className="bg-bunker-900 border border-bunker-700 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200"
                              >
                                <option value="instant">Тип: Мгновенное</option>
                                <option value="voting">Тип: На фазе голосования</option>
                                <option value="passive">Тип: Пассивное</option>
                              </select>
                              <select
                                value={newAbilityEffect}
                                onChange={(e) =>
                                  setNewAbilityEffect(e.target.value as AbilityEffectType)
                                }
                                className="bg-bunker-900 border border-bunker-700 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200"
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
                              placeholder="Подробное описание действия спец. способности..."
                              className="w-full bg-bunker-900 border border-bunker-700 rounded-lg px-3 py-1.5 text-xs text-zinc-200"
                              required
                            />
                          </div>
                        )}

                        <button
                          type="submit"
                          className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-bunker-950 font-bold text-xs uppercase tracking-wider transition"
                        >
                          Добавить карту в пак
                        </button>
                      </form>

                      {/* List of existing cards in selected category */}
                      <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                        {(currentPack.cards?.[selectedAttrKey] || []).map((card) => (
                          <div
                            key={card.id}
                            className="p-3 rounded-xl bg-bunker-950 border border-bunker-800 flex items-start justify-between gap-3"
                          >
                            <div className="space-y-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs font-semibold text-zinc-100">
                                  {card.text}
                                </span>
                                <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-bunker-800 text-amber-300">
                                  {card.rarity}
                                </span>
                              </div>
                              {card.condition && (
                                <div className="text-[11px] text-zinc-400">
                                  Условие: {card.condition}
                                </div>
                              )}
                              {card.ability && (
                                <div className="text-[11px] text-amber-300/90 font-mono">
                                  ⚡ Способность «{card.ability.name}» ({card.ability.type}):{' '}
                                  {card.ability.description}
                                </div>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={() => handleDeleteCard(card.id)}
                              className="p-1.5 text-zinc-500 hover:text-red-400 transition shrink-0"
                              title="Удалить карту"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* SUBTAB: CATASTROPHES */}
                  {packSubTab === 'catastrophes' && (
                    <div className="space-y-3">
                      <button
                        type="button"
                        onClick={handleAddCatastrophe}
                        className="px-3.5 py-2 rounded-lg bg-amber-500/20 border border-amber-500/40 text-amber-300 text-xs font-mono flex items-center gap-1.5"
                      >
                        <Plus className="w-4 h-4" /> Добавить сценарий катастрофы
                      </button>
                      {(currentPack.catastrophes || []).map((cat, idx) => (
                        <div
                          key={cat.id}
                          className="p-3.5 rounded-xl bg-bunker-950 border border-bunker-700 space-y-2"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <input
                              type="text"
                              value={cat.title}
                              onChange={(e) =>
                                updateCurrentPack((d) => {
                                  d.catastrophes[idx].title = e.target.value;
                                  return d;
                                })
                              }
                              className="flex-1 bg-bunker-900 border border-bunker-700 rounded-lg px-3 py-1.5 text-xs font-bold text-amber-300"
                              placeholder="Название катастрофы"
                            />
                            <button
                              type="button"
                              onClick={() =>
                                updateCurrentPack((d) => {
                                  d.catastrophes.splice(idx, 1);
                                  return d;
                                })
                              }
                              className="p-1.5 text-zinc-500 hover:text-red-400"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                          <textarea
                            rows={2}
                            value={cat.description}
                            onChange={(e) =>
                              updateCurrentPack((d) => {
                                d.catastrophes[idx].description = e.target.value;
                                return d;
                              })
                            }
                            className="w-full bg-bunker-900 border border-bunker-700 rounded-lg px-3 py-1.5 text-xs text-zinc-200"
                            placeholder="Описание катастрофы..."
                          />
                          <input
                            type="text"
                            value={cat.threats}
                            onChange={(e) =>
                              updateCurrentPack((d) => {
                                d.catastrophes[idx].threats = e.target.value;
                                return d;
                              })
                            }
                            className="w-full bg-bunker-900 border border-bunker-700 rounded-lg px-3 py-1.5 text-xs text-red-300"
                            placeholder="Угрозы снаружи..."
                          />
                        </div>
                      ))}
                    </div>
                  )}

                  {/* SUBTAB: BUNKER PRESETS */}
                  {packSubTab === 'bunkers' && (
                    <div className="space-y-3">
                      <button
                        type="button"
                        onClick={handleAddBunkerPreset}
                        className="px-3.5 py-2 rounded-lg bg-amber-500/20 border border-amber-500/40 text-amber-300 text-xs font-mono flex items-center gap-1.5"
                      >
                        <Plus className="w-4 h-4" /> Добавить пресет бункера
                      </button>
                      {(currentPack.bunkers || []).map((bunk, idx) => (
                        <div
                          key={bunk.id}
                          className="p-3.5 rounded-xl bg-bunker-950 border border-bunker-700 space-y-2"
                        >
                          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                            <input
                              type="text"
                              value={bunk.name}
                              onChange={(e) =>
                                updateCurrentPack((d) => {
                                  d.bunkers[idx].name = e.target.value;
                                  return d;
                                })
                              }
                              className="sm:col-span-2 bg-bunker-900 border border-bunker-700 rounded-lg px-3 py-1.5 text-xs font-bold text-emerald-300"
                              placeholder="Название бункера"
                            />
                            <input
                              type="number"
                              value={bunk.size}
                              onChange={(e) =>
                                updateCurrentPack((d) => {
                                  d.bunkers[idx].size = Number(e.target.value) || 100;
                                  return d;
                                })
                              }
                              className="bg-bunker-900 border border-bunker-700 rounded-lg px-3 py-1.5 text-xs text-zinc-200"
                              placeholder="Площадь кв. м"
                            />
                            <div className="flex gap-1">
                              <input
                                type="text"
                                value={bunk.duration}
                                onChange={(e) =>
                                  updateCurrentPack((d) => {
                                    d.bunkers[idx].duration = e.target.value;
                                    return d;
                                  })
                                }
                                className="flex-1 bg-bunker-900 border border-bunker-700 rounded-lg px-3 py-1.5 text-xs text-zinc-200"
                                placeholder="Срок изоляции"
                              />
                              <button
                                type="button"
                                onClick={() =>
                                  updateCurrentPack((d) => {
                                    d.bunkers.splice(idx, 1);
                                    return d;
                                  })
                                }
                                className="p-1.5 text-zinc-500 hover:text-red-400"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                          <textarea
                            rows={2}
                            value={bunk.supplies}
                            onChange={(e) =>
                              updateCurrentPack((d) => {
                                d.bunkers[idx].supplies = e.target.value;
                                return d;
                              })
                            }
                            className="w-full bg-bunker-900 border border-bunker-700 rounded-lg px-3 py-1.5 text-xs text-zinc-200"
                            placeholder="Запасы и оборудование..."
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* TAB 4: SECURITY */}
              {activeTab === 'security' && (
                <div className="space-y-4 max-w-md">
                  <div className="p-4 rounded-xl bg-bunker-950 border border-bunker-700 space-y-3">
                    <h4 className="text-sm font-bold text-amber-400 font-mono">
                      Смена мастер-пароля администратора
                    </h4>
                    <input
                      type="password"
                      value={newAdminPwd}
                      onChange={(e) => setNewAdminPwd(e.target.value)}
                      placeholder="Новый мастер-пароль..."
                      className="w-full bg-bunker-900 border border-bunker-600 rounded-xl px-3.5 py-2.5 text-sm text-zinc-100"
                    />
                    {pwdSavedMsg && (
                      <div className="text-xs text-emerald-400 font-mono">{pwdSavedMsg}</div>
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
    </div>
  );
};

