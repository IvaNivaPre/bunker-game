import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  PlusCircle,
  LogIn,
  Settings,
  Database,
  BookOpen,
  ArrowRight,
  RotateCcw,
  Terminal,
  X,
  Layers,
} from 'lucide-react';
import {
  getActivePackIds,
  getAllPacks,
  getLastRoomCode,
  getSavedUserName,
  saveLastRoomCode,
  saveUserName,
  setActivePackIds,
} from '../services/storageService';
import {
  checkRoomExists,
  getSyncMode,
  normalizeRoomCode,
} from '../services/firebaseService';
import { PackMultiSelector } from './PackMultiSelector';
import { sound } from '../services/soundService';

interface HomeScreenProps {
  onCreateRoom: (hostName: string, packIds: string[]) => Promise<void>;
  onJoinRoom: (code: string, playerName: string) => Promise<void>;
  onOpenAdmin: () => void;
  errorMsg: string | null;
  clearError: () => void;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({
  onCreateRoom,
  onJoinRoom,
  onOpenAdmin,
  errorMsg,
  clearError,
}) => {
  const [step, setStep] = useState<'main' | 'join-name' | 'create-name'>('main');
  const [roomCodeInput, setRoomCodeInput] = useState<string>('');
  const [playerName, setPlayerName] = useState<string>(getSavedUserName() || '');
  const [selectedPackIds, setSelectedPackIds] = useState<string[]>(() =>
    getActivePackIds()
  );
  const [loading, setLoading] = useState<boolean>(false);
  const [showRules, setShowRules] = useState<boolean>(false);
  const [lastRoom, setLastRoom] = useState<string | null>(() => getLastRoomCode());

  const packs = getAllPacks();
  const syncMode = getSyncMode();

  useEffect(() => {
    let cancelled = false;

    const verifySavedRoom = async () => {
      const saved = getLastRoomCode();
      if (!saved) {
        if (!cancelled) setLastRoom(null);
        return;
      }
      const exists = await checkRoomExists(saved);
      if (cancelled) return;
      if (!exists) {
        saveLastRoomCode(null);
        setLastRoom(null);
      } else {
        setLastRoom(normalizeRoomCode(saved));
      }
    };

    verifySavedRoom();

    const handleRoomsUpdated = () => {
      verifySavedRoom();
    };

    window.addEventListener('bunker-rooms-updated', handleRoomsUpdated);
    window.addEventListener('storage', handleRoomsUpdated);
    return () => {
      cancelled = true;
      window.removeEventListener('bunker-rooms-updated', handleRoomsUpdated);
      window.removeEventListener('storage', handleRoomsUpdated);
    };
  }, []);

  const selectedPackNames = packs
    .filter((p) => selectedPackIds.includes(p.id))
    .map((p) => p.name)
    .join(', ');

  const handleCodeStepSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    const cleaned = normalizeRoomCode(roomCodeInput)
      .replace(/[^A-Z0-9]/g, '')
      .slice(0, 3);
    if (cleaned.length !== 3) return;
    sound.playClick();
    setRoomCodeInput(cleaned);
    setStep('join-name');
  };

  const handleConfirmJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!playerName.trim()) return;
    setLoading(true);
    saveUserName(playerName.trim());
    sound.playClick();
    try {
      await onJoinRoom(normalizeRoomCode(roomCodeInput), playerName.trim());
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!playerName.trim()) return;
    setLoading(true);
    saveUserName(playerName.trim());
    setActivePackIds(selectedPackIds);
    sound.playClick();
    try {
      await onCreateRoom(playerName.trim(), selectedPackIds);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-between p-4 sm:p-6 relative overflow-hidden">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(245,158,11,0.10),_transparent_65%)]" />

      {/* Top Bar */}
      <header className="relative z-10 max-w-5xl w-full mx-auto flex items-center justify-between gap-3 py-2">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/40 flex items-center justify-center text-amber-400 shadow-lg shadow-amber-500/10">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div>
            <span className="font-mono text-xs uppercase tracking-widest text-amber-400 block">
              СИСТЕМА УБЕЖИЩА v3.0
            </span>
            <h1 className="text-base sm:text-lg font-extrabold tracking-tight text-zinc-100">
              БУНКЕР <span className="text-amber-400">ОНЛАЙН</span>
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowRules(true)}
            className="px-3 py-2 rounded-xl bg-bunker-900 border border-bunker-700 hover:border-bunker-500 text-xs font-mono text-zinc-300 flex items-center gap-1.5 transition"
          >
            <BookOpen className="w-4 h-4 text-amber-400" />
            <span className="hidden sm:inline">Правила</span>
          </button>

          <button
            type="button"
            onClick={onOpenAdmin}
            className="px-3.5 py-2 rounded-xl bg-amber-500/15 border border-amber-500/40 hover:bg-amber-500/25 text-xs font-mono text-amber-300 flex items-center gap-1.5 transition"
          >
            <Settings className="w-4 h-4" />
            <span>Админ (/admin)</span>
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative z-10 max-w-xl w-full mx-auto my-auto py-6 space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-mono">
            <Terminal className="w-3.5 h-3.5" />
            <span>ПРОТОКОЛ ОТБОРА ВЫЖИВШИХ</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-black tracking-tight text-zinc-100">
            МЕСТ ХВАТИТ <span className="text-amber-400">НЕ ВСЕМ</span>
          </h2>
          <p className="text-xs sm:text-sm text-zinc-400 max-w-md mx-auto leading-relaxed">
            У каждого 11 характеристик, уникальные спец. способности профессии и хобби, тайное голосование и борьба за место в убежище.
          </p>
        </div>

        {errorMsg && (
          <div className="p-4 rounded-2xl bg-red-500/15 border-2 border-red-500/40 text-xs text-red-200 space-y-2.5 animate-fadeIn">
            <div className="flex items-start justify-between gap-2">
              <div className="space-y-1">
                <div className="font-bold text-red-100 text-xs sm:text-sm">
                  {errorMsg.includes('не найдена')
                    ? 'Комната не найдена. Проблемы с соединением? Попробуйте включить или, наоборот, выключить VPN'
                    : errorMsg}
                </div>
                {errorMsg.includes('не найдена') && (
                  <p className="text-[11px] text-red-300/90 leading-relaxed">
                    Код комнаты: <strong className="font-mono">#{normalizeRoomCode(roomCodeInput) || '---'}</strong>. Убедитесь, что Хост уже открыл лобби, или переключите тумблер VPN и нажмите «Повторить».
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={clearError}
                className="text-red-300 hover:text-white p-1 shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {normalizeRoomCode(roomCodeInput).length === 3 && (
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  disabled={loading}
                  onClick={async () => {
                    const cleaned = normalizeRoomCode(roomCodeInput);
                    if (cleaned.length !== 3) return;
                    setLoading(true);
                    sound.playClick();
                    try {
                      await onJoinRoom(
                        cleaned,
                        (playerName || getSavedUserName() || 'Выживший').trim()
                      );
                    } finally {
                      setLoading(false);
                    }
                  }}
                  className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-bunker-950 font-bold text-xs font-mono flex items-center gap-1.5 transition shadow"
                >
                  <RotateCcw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                  <span>{loading ? 'Подключение...' : 'Повторить попытку (Retry)'}</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* Quick Rejoin Banner */}
        {lastRoom && step === 'main' && (
          <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-between gap-3">
            <div className="text-xs min-w-0">
              <span className="text-emerald-300 font-mono block uppercase">
                Активная сессия: Бункер #{lastRoom}
              </span>
              <span className="text-zinc-400 truncate block">
                Вернуться в комнату под именем {playerName || 'Выживший'}
              </span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => {
                  const cleaned = normalizeRoomCode(lastRoom);
                  setRoomCodeInput(cleaned);
                  if (playerName.trim()) {
                    onJoinRoom(cleaned, playerName.trim());
                  } else {
                    setStep('join-name');
                  }
                }}
                className="px-3.5 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-bunker-950 font-bold text-xs font-mono flex items-center gap-1.5 transition"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Вернуться
              </button>
              <button
                type="button"
                onClick={() => {
                  saveLastRoomCode(null);
                  setLastRoom(null);
                }}
                title="Скрыть уведомление о сессии"
                className="p-2 rounded-lg bg-bunker-900/80 hover:bg-bunker-800 text-zinc-400 hover:text-zinc-200 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 1: MAIN SCREEN */}
        {step === 'main' && (
          <div className="space-y-4">
            <form
              onSubmit={handleCodeStepSubmit}
              className="p-5 sm:p-6 rounded-2xl bg-bunker-900/90 border-2 border-bunker-700 shadow-2xl space-y-4"
            >
              <div className="flex items-center justify-between">
                <label className="text-xs font-mono uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                  <LogIn className="w-4 h-4" />
                  Войти в бункер по коду комнаты
                </label>
                <span className="text-[11px] font-mono text-zinc-500">
                  3 символа (напр. 7A2)
                </span>
              </div>

              <div className="flex gap-3">
                <input
                  type="text"
                  maxLength={3}
                  value={roomCodeInput}
                  onChange={(e) =>
                    setRoomCodeInput(
                      normalizeRoomCode(e.target.value)
                        .replace(/[^A-Z0-9]/g, '')
                        .slice(0, 3)
                    )
                  }
                  placeholder="7A2"
                  className="w-full text-center text-2xl sm:text-3xl font-mono font-bold tracking-[0.35em] uppercase bg-bunker-950 border-2 border-bunker-600 focus:border-amber-500 rounded-xl py-3 text-amber-400 placeholder:text-zinc-700 focus:outline-none transition"
                />
                <button
                  type="submit"
                  disabled={normalizeRoomCode(roomCodeInput).length !== 3}
                  className="px-6 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-bunker-950 font-extrabold text-sm uppercase tracking-wider transition flex items-center gap-2 shrink-0"
                >
                  <span>Войти</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
              <p className="text-[11px] text-zinc-500 font-mono text-center">
                Не находит комнату? Попробуйте включить или, наоборот, выключить VPN.
              </p>
            </form>

            <div className="flex items-center gap-3 text-xs font-mono text-zinc-600">
              <div className="h-px bg-bunker-800 flex-1" />
              <span>ИЛИ РАЗВЕРНУТЬ НОВЫЙ БУНКЕР</span>
              <div className="h-px bg-bunker-800 flex-1" />
            </div>

            <button
              type="button"
              onClick={() => {
                sound.playClick();
                clearError();
                setStep('create-name');
              }}
              className="w-full p-4 rounded-2xl bg-bunker-900 hover:bg-bunker-800 border-2 border-amber-500/40 hover:border-amber-500 transition flex items-center justify-between group shadow-lg"
            >
              <div className="flex items-center gap-3.5 text-left min-w-0">
                <div className="w-11 h-11 rounded-xl bg-amber-500/15 border border-amber-500/40 flex items-center justify-center text-amber-400 group-hover:scale-105 transition shrink-0">
                  <PlusCircle className="w-6 h-6" />
                </div>
                <div className="min-w-0">
                  <div className="text-base font-bold text-zinc-100">
                    Создать игру (Хост)
                  </div>
                  <div className="text-xs text-zinc-400 truncate">
                    Набор: {selectedPackNames || 'Классический пак'}
                  </div>
                </div>
              </div>
              <ArrowRight className="w-5 h-5 text-amber-400 group-hover:translate-x-1 transition shrink-0" />
            </button>
          </div>
        )}

        {/* STEP 2A: ENTER NICKNAME AFTER ENTERING 3-CHAR ROOM CODE */}
        {step === 'join-name' && (
          <form
            onSubmit={handleConfirmJoin}
            className="p-6 rounded-2xl bg-bunker-900 border-2 border-amber-500/50 shadow-2xl space-y-4 animate-fadeIn"
          >
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-mono uppercase text-amber-400 block">
                  Подключение к шлюзу #{roomCodeInput}
                </span>
                <h3 className="text-lg font-bold text-zinc-100">
                  Представьтесь для досье
                </h3>
              </div>
              <span className="px-3 py-1 rounded-lg bg-amber-500/20 border border-amber-500/40 font-mono font-bold text-amber-300">
                #{roomCodeInput}
              </span>
            </div>

            <div>
              <label className="block text-xs font-mono uppercase text-zinc-400 mb-1.5">
                Ваше отображаемое имя / позывной:
              </label>
              <input
                type="text"
                maxLength={24}
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                placeholder="Например: Алексей"
                autoFocus
                required
                className="w-full bg-bunker-950 border-2 border-bunker-600 focus:border-amber-500 rounded-xl px-4 py-3 text-base text-zinc-100 focus:outline-none"
              />
            </div>

            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={() => setStep('main')}
                className="px-4 py-3 rounded-xl bg-bunker-800 hover:bg-bunker-700 text-zinc-300 text-xs font-mono uppercase"
              >
                Назад
              </button>
              <button
                type="submit"
                disabled={loading || !playerName.trim()}
                className="flex-1 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-bunker-950 font-extrabold text-sm uppercase tracking-wider transition"
              >
                {loading ? 'Проверка комнаты...' : 'Войти в бункер'}
              </button>
            </div>
          </form>
        )}

        {/* STEP 2B: CREATE ROOM WITH MULTI-SELECT CHARACTERISTIC PACKS (Section 3) */}
        {step === 'create-name' && (
          <form
            onSubmit={handleConfirmCreate}
            className="p-5 sm:p-6 rounded-2xl bg-bunker-900 border-2 border-amber-500/50 shadow-2xl space-y-4 animate-fadeIn"
          >
            <div>
              <span className="text-xs font-mono uppercase text-amber-400 block">
                Инициализация нового убежища
              </span>
              <h3 className="text-lg font-bold text-zinc-100">
                Настройка Хоста и выбор паков характеристик
              </h3>
            </div>

            <div>
              <label className="block text-xs font-mono uppercase text-zinc-400 mb-1.5">
                Ваше имя (Хост бункера):
              </label>
              <input
                type="text"
                maxLength={24}
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                placeholder="Например: Алексей"
                autoFocus
                required
                className="w-full bg-bunker-950 border-2 border-bunker-600 focus:border-amber-500 rounded-xl px-4 py-2.5 text-sm sm:text-base text-zinc-100 focus:outline-none"
              />
            </div>

            {/* Multi-pack selector with search, tag filter, and sort */}
            <div>
              <label className="block text-xs font-mono uppercase text-zinc-400 mb-1.5">
                Мульти-выбор паков характеристик (можно выбрать несколько):
              </label>
              <PackMultiSelector
                packs={packs}
                selectedPackIds={selectedPackIds}
                onChange={(ids) => {
                  setSelectedPackIds(ids);
                  setActivePackIds(ids);
                }}
              />
            </div>

            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={() => setStep('main')}
                className="px-4 py-3 rounded-xl bg-bunker-800 hover:bg-bunker-700 text-zinc-300 text-xs font-mono uppercase"
              >
                Назад
              </button>
              <button
                type="submit"
                disabled={
                  loading || !playerName.trim() || selectedPackIds.length === 0
                }
                className="flex-1 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-bunker-950 font-extrabold text-sm uppercase tracking-wider transition"
              >
                {loading ? 'Создание...' : 'Создать комнату'}
              </button>
            </div>
          </form>
        )}

        {/* System Status Footer Badges */}
        <div className="grid grid-cols-2 gap-2.5 pt-2">
          <button
            type="button"
            onClick={onOpenAdmin}
            className="p-3 rounded-xl bg-bunker-900/70 border border-bunker-800 hover:border-bunker-600 text-left transition flex items-center gap-2.5"
          >
            <Database
              className={`w-4 h-4 shrink-0 ${
                syncMode !== 'local' ? 'text-emerald-400' : 'text-amber-400'
              }`}
            />
            <div className="truncate">
              <div className="text-[10px] font-mono uppercase text-zinc-500">
                Сервер БД
              </div>
              <div className="text-xs font-mono text-zinc-300 truncate">
                {syncMode === 'firebase-rtdb'
                  ? 'Firebase RTDB'
                  : syncMode === 'firebase-firestore'
                  ? 'Firebase Firestore'
                  : 'Локальный / Мульти-таб'}
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={onOpenAdmin}
            className="p-3 rounded-xl bg-bunker-900/70 border border-bunker-800 hover:border-bunker-600 text-left transition flex items-center gap-2.5"
          >
            <Layers className="w-4 h-4 shrink-0 text-amber-400" />
            <div className="truncate">
              <div className="text-[10px] font-mono uppercase text-zinc-500">
                База материалов
              </div>
              <div className="text-xs font-mono text-zinc-300 truncate">
                Паков: {packs.length} • Настроить в /admin
              </div>
            </div>
          </button>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 text-center text-[11px] font-mono text-zinc-600 py-2">
        БУНКЕР ОНЛАЙН • SPA ДЛЯ GITHUB PAGES • FIREBASE REALTIME SYNC
      </footer>

      {/* Rules Modal */}
      {showRules && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          onClick={() => setShowRules(false)}
        >
          <div
            className="max-w-xl w-full bg-bunker-900 border-2 border-bunker-600 rounded-2xl p-5 sm:p-6 space-y-4 max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-bunker-700 pb-3">
              <h3 className="text-lg font-bold text-amber-400 font-mono">
                ПРАВИЛА ИГРЫ «БУНКЕР ОНЛАЙН»
              </h3>
              <button
                onClick={() => setShowRules(false)}
                className="p-1 text-zinc-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-3 text-xs sm:text-sm text-zinc-300 leading-relaxed">
              <p>
                <strong className="text-amber-300">1. Катастрофа и убежище:</strong> На Земле произошёл глобальный катаклизм. У входа в герметичный бункер собрались выжившие, но мест внутри строго ограничено (обычно половина от числа игроков).
              </p>
              <p>
                <strong className="text-amber-300">2. Карточка персонажа (11 характеристик):</strong> Каждый игрок получает уникальное досье из выбранных паков: Профессия, Пол и возраст, Здоровье, Телосложение, Хобби, Черта характера, Фобия, Крупный инвентарь, Рюкзак, Доп. сведение и одноразовая Спец. возможность.
              </p>
              <p>
                <strong className="text-amber-300">3. Спец. способности (ℹ️):</strong> У каждой Профессии и Хобби есть активная способность! Нажмите на пульсирующую иконку <code className="text-amber-300">ℹ️</code> возле вскрытой профессии или хобби, чтобы вылечить игрока, модернизировать бункер, принудительно вскрыть чужую карту или получить защиту на голосовании.
              </p>
              <p>
                <strong className="text-amber-300">4. Раунды и Трибунал:</strong> В каждом раунде игроки по очереди вскрывают по 1–2 характеристики и убеждают остальных в своей полезности. На голосовании кандидат с наибольшим числом голосов изгоняется (всем выводится сводка голосов), а изгнанный переходит в статус наблюдателя. При ничьей даётся 30 секунд на оправдательную речь и проводится повторное голосование.
              </p>
              <p>
                <strong className="text-amber-300">5. Финал и герметизация:</strong> Когда число живых участников становится равным вместимости бункера, гермодвери закрываются и открывается финальный экран выживших и параметров убежища.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
