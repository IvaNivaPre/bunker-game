import React, { useState } from 'react';
import {
  Copy,
  Check,
  Users,
  Crown,
  Bot,
  Play,
  Sliders,
  Sparkles,
  LogOut,
  Trash2,
  UserCheck,
  ShieldAlert,
  Clock,
  Maximize2,
  Package,
  Shuffle,
} from 'lucide-react';
import { RoomData } from '../types/game';
import {
  addBotToRoom,
  removeOrLeavePlayer,
  startGame,
  transferHost,
  updateBunkerSettings,
} from '../services/firebaseService';
import { getAllPacks, getPackById } from '../services/storageService';
import { sound } from '../services/soundService';

interface LobbyScreenProps {
  room: RoomData;
  currentUserUid: string;
  onLeaveRoom: () => void;
}

export const LobbyScreen: React.FC<LobbyScreenProps> = ({
  room,
  currentUserUid,
  onLeaveRoom,
}) => {
  const [copied, setCopied] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedCatPresetIdx, setSelectedCatPresetIdx] = useState<number>(0);
  const [selectedBunkPresetIdx, setSelectedBunkPresetIdx] = useState<number>(0);

  const playersList = Object.values(room.players || {}).sort(
    (a, b) => a.joinedAt - b.joinedAt
  );
  const isHost =
    room.hostId === currentUserUid ||
    Boolean(room.players[currentUserUid]?.isHost);

  const packs = getAllPacks();
  const activePack = getPackById(room.settings.packId);

  const handleCopyCode = () => {
    navigator.clipboard.writeText(room.code);
    sound.playClick();
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleLoadFromPack = (random = false) => {
    sound.playReveal();
    const cats = activePack.catastrophes || [];
    const bunks = activePack.bunkers || [];

    const catIdx = random
      ? Math.floor(Math.random() * Math.max(1, cats.length))
      : selectedCatPresetIdx % Math.max(1, cats.length);
    const bunkIdx = random
      ? Math.floor(Math.random() * Math.max(1, bunks.length))
      : selectedBunkPresetIdx % Math.max(1, bunks.length);

    const chosenCat = cats[catIdx];
    const chosenBunk = bunks[bunkIdx];

    setSelectedCatPresetIdx(catIdx);
    setSelectedBunkPresetIdx(bunkIdx);

    updateBunkerSettings(room.code, {
      capacity: Math.max(1, Math.floor(playersList.length / 2)),
      duration: chosenBunk?.duration || '3 года',
      size: chosenBunk?.size || 100,
      supplies:
        chosenBunk?.supplies ||
        'Гидропонный модуль, запас консервов на 2 года, медблок',
      catastrophe: chosenCat
        ? `${chosenCat.title}. ${chosenCat.description} Угрозы: ${chosenCat.threats}`
        : room.settings.catastrophe,
      catastropheTitle: chosenCat?.title,
      threats: chosenCat?.threats,
    });
  };

  const handleStartMatch = async () => {
    setError(null);
    setStarting(true);
    sound.playAlarm();
    try {
      await startGame(room.code);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto p-3 sm:p-6 space-y-5 pb-16">
      {/* Top Room Code Banner */}
      <div className="p-5 rounded-2xl bg-bunker-900 border-2 border-amber-500/40 shadow-xl flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="text-center sm:text-left space-y-1">
          <div className="text-xs font-mono uppercase tracking-widest text-amber-400">
            ФАЗА 1 // ОЖИДАНИЕ У ГЕРМОДВЕРЕЙ БУНКЕРА
          </div>
          <h2 className="text-xl sm:text-2xl font-extrabold text-zinc-100">
            Продиктуйте 3-значный код игрокам:
          </h2>
          <p className="text-xs text-zinc-400">
            Участников: <strong className="text-zinc-200">{playersList.length}</strong> • Мест в бункере:{' '}
            <strong className="text-amber-400">{room.settings.capacity}</strong>
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div
            onClick={handleCopyCode}
            className="cursor-pointer px-6 py-3 rounded-2xl bg-bunker-950 border-2 border-amber-500 hover:bg-amber-500/10 transition flex items-center gap-3 group"
            title="Нажмите, чтобы скопировать код"
          >
            <span className="text-3xl sm:text-4xl font-mono font-black tracking-[0.28em] text-amber-400">
              {room.code}
            </span>
            {copied ? (
              <Check className="w-5 h-5 text-emerald-400" />
            ) : (
              <Copy className="w-5 h-5 text-zinc-400 group-hover:text-amber-400 transition" />
            )}
          </div>

          <button
            type="button"
            onClick={onLeaveRoom}
            className="p-3.5 rounded-xl bg-bunker-800 hover:bg-red-500/20 border border-bunker-700 hover:border-red-500/40 text-zinc-400 hover:text-red-300 transition"
            title="Покинуть лобби"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3.5 rounded-xl bg-red-500/15 border border-red-500/40 text-xs text-red-200">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left Column: Connected Players */}
        <div className="lg:col-span-5 p-4 sm:p-5 rounded-2xl bg-bunker-900 border border-bunker-700 space-y-4 flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-mono uppercase tracking-wider text-amber-400 flex items-center gap-2">
                <Users className="w-4 h-4" />
                Очередь выживших ({playersList.length})
              </h3>
              {isHost && (
                <button
                  type="button"
                  onClick={() => {
                    sound.playClick();
                    addBotToRoom(room.code);
                  }}
                  className="px-2.5 py-1.5 rounded-lg bg-amber-500/15 border border-amber-500/40 hover:bg-amber-500/25 text-amber-300 text-xs font-mono flex items-center gap-1.5 transition"
                >
                  <Bot className="w-3.5 h-3.5" />
                  + Бот
                </button>
              )}
            </div>

            <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
              {playersList.map((player, idx) => (
                <div
                  key={player.uid}
                  className={`p-3 rounded-xl border flex items-center justify-between gap-2 ${
                    player.uid === currentUserUid
                      ? 'bg-amber-500/10 border-amber-500/40'
                      : 'bg-bunker-950 border-bunker-800'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="w-6 h-6 rounded-lg bg-bunker-800 text-zinc-400 font-mono text-xs flex items-center justify-center shrink-0">
                      {idx + 1}
                    </span>
                    <span className="text-sm font-semibold text-zinc-100 truncate">
                      {player.name}
                    </span>
                    {player.uid === currentUserUid && (
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300">
                        Вы
                      </span>
                    )}
                    {player.isHost && (
                      <span
                        className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-500 text-bunker-950 font-bold flex items-center gap-1"
                        title="Хост комнаты"
                      >
                        <Crown className="w-3 h-3" /> ХОСТ
                      </span>
                    )}
                    {player.isBot && (
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-300">
                        ИИ-Бот
                      </span>
                    )}
                  </div>

                  {isHost && player.uid !== currentUserUid && (
                    <div className="flex items-center gap-1 shrink-0">
                      {!player.isBot && (
                        <button
                          type="button"
                          onClick={() => transferHost(room.code, player.uid)}
                          className="p-1.5 rounded-lg text-zinc-400 hover:text-amber-400 hover:bg-bunker-800"
                          title="Передать права Хоста"
                        >
                          <UserCheck className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => removeOrLeavePlayer(room.code, player.uid)}
                        className="p-1.5 rounded-lg text-zinc-400 hover:text-red-400 hover:bg-bunker-800"
                        title="Исключить из комнаты"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Start Game Action */}
          <div className="pt-3 border-t border-bunker-800 space-y-2">
            {isHost ? (
              <>
                {playersList.length < 2 && (
                  <p className="text-xs text-amber-300/90 font-mono text-center">
                    Подключите второго игрока или нажмите «+ Бот» для тестового запуска
                  </p>
                )}
                <button
                  type="button"
                  disabled={starting || playersList.length < 2}
                  onClick={handleStartMatch}
                  className="w-full py-3.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 disabled:opacity-40 text-bunker-950 font-black text-sm uppercase tracking-wider shadow-lg shadow-amber-500/20 transition flex items-center justify-center gap-2"
                >
                  <Play className="w-4 h-4 fill-current" />
                  {starting
                    ? 'Раздача 11 характеристик...'
                    : `Начать игру (${playersList.length} игр. → ${room.settings.capacity} мест)`}
                </button>
              </>
            ) : (
              <div className="p-3 rounded-xl bg-bunker-950 border border-bunker-800 text-center text-xs font-mono text-zinc-400">
                Ожидание запуска игры Хостом ({room.players[room.hostId]?.name || 'Хост'})...
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Bunker Settings (Editable by Host, Live Preview for Players) */}
        <div className="lg:col-span-7 p-4 sm:p-5 rounded-2xl bg-bunker-900 border border-bunker-700 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-bunker-800 pb-3">
            <h3 className="text-sm font-mono uppercase tracking-wider text-amber-400 flex items-center gap-2">
              <Sliders className="w-4 h-4" />
              Параметры бункера и катастрофы
            </h3>

            {isHost && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleLoadFromPack(true)}
                  className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-bunker-950 font-bold text-xs font-mono flex items-center gap-1.5 shadow transition"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Загрузить из пака
                </button>
              </div>
            )}
          </div>

          {/* Pack & Preset Selector for Host */}
          {isHost && (
            <div className="p-3.5 rounded-xl bg-bunker-950 border border-bunker-800 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div>
                  <label className="block text-[10px] font-mono uppercase text-zinc-400 mb-1">
                    Активный пак карт:
                  </label>
                  <select
                    value={room.settings.packId}
                    onChange={(e) =>
                      updateBunkerSettings(room.code, { packId: e.target.value })
                    }
                    className="w-full bg-bunker-900 border border-bunker-700 rounded-lg px-2.5 py-1.5 text-xs text-zinc-100"
                  >
                    {packs.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-mono uppercase text-zinc-400 mb-1">
                    Пресет катастрофы:
                  </label>
                  <select
                    value={selectedCatPresetIdx}
                    onChange={(e) => {
                      const idx = Number(e.target.value);
                      setSelectedCatPresetIdx(idx);
                      const c = activePack.catastrophes[idx];
                      if (c) {
                        updateBunkerSettings(room.code, {
                          catastrophe: `${c.title}. ${c.description} Угрозы: ${c.threats}`,
                          catastropheTitle: c.title,
                          threats: c.threats,
                        });
                      }
                    }}
                    className="w-full bg-bunker-900 border border-bunker-700 rounded-lg px-2.5 py-1.5 text-xs text-zinc-100"
                  >
                    {(activePack.catastrophes || []).map((c, i) => (
                      <option key={c.id} value={i}>
                        {c.title}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-mono uppercase text-zinc-400 mb-1">
                    Пресет бункера:
                  </label>
                  <select
                    value={selectedBunkPresetIdx}
                    onChange={(e) => {
                      const idx = Number(e.target.value);
                      setSelectedBunkPresetIdx(idx);
                      const b = activePack.bunkers[idx];
                      if (b) {
                        updateBunkerSettings(room.code, {
                          size: b.size,
                          duration: b.duration,
                          supplies: b.supplies,
                        });
                      }
                    }}
                    className="w-full bg-bunker-900 border border-bunker-700 rounded-lg px-2.5 py-1.5 text-xs text-zinc-100"
                  >
                    {(activePack.bunkers || []).map((b, i) => (
                      <option key={b.id} value={i}>
                        {b.name} ({b.size} м²)
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => handleLoadFromPack(true)}
                  className="text-xs font-mono text-amber-400 hover:text-amber-300 flex items-center gap-1"
                >
                  <Shuffle className="w-3.5 h-3.5" /> Случайная комбинация из пака
                </button>
              </div>
            </div>
          )}

          {/* Numeric / Short Fields: Capacity, Duration, Size, Round Timer */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-[11px] font-mono uppercase text-zinc-400 mb-1 flex items-center gap-1">
                <Users className="w-3 h-3 text-amber-400" /> Вместимость:
              </label>
              <input
                type="number"
                min={1}
                max={Math.max(1, playersList.length - 1)}
                disabled={!isHost}
                value={room.settings.capacity}
                onChange={(e) =>
                  updateBunkerSettings(room.code, {
                    capacity: Math.max(1, Number(e.target.value) || 1),
                  })
                }
                className="w-full bg-bunker-950 border border-bunker-700 rounded-xl px-3 py-2 text-sm font-mono font-bold text-amber-400 disabled:opacity-70"
              />
            </div>

            <div>
              <label className="block text-[11px] font-mono uppercase text-zinc-400 mb-1 flex items-center gap-1">
                <Clock className="w-3 h-3 text-amber-400" /> Срок изоляции:
              </label>
              <input
                type="text"
                disabled={!isHost}
                value={room.settings.duration}
                onChange={(e) =>
                  updateBunkerSettings(room.code, { duration: e.target.value })
                }
                placeholder="3 года"
                className="w-full bg-bunker-950 border border-bunker-700 rounded-xl px-3 py-2 text-sm text-zinc-100 disabled:opacity-70"
              />
            </div>

            <div>
              <label className="block text-[11px] font-mono uppercase text-zinc-400 mb-1 flex items-center gap-1">
                <Maximize2 className="w-3 h-3 text-amber-400" /> Площадь (кв. м):
              </label>
              <input
                type="number"
                min={20}
                max={5000}
                disabled={!isHost}
                value={room.settings.size}
                onChange={(e) =>
                  updateBunkerSettings(room.code, {
                    size: Math.max(10, Number(e.target.value) || 100),
                  })
                }
                className="w-full bg-bunker-950 border border-bunker-700 rounded-xl px-3 py-2 text-sm font-mono text-zinc-100 disabled:opacity-70"
              />
            </div>

            <div>
              <label className="block text-[11px] font-mono uppercase text-zinc-400 mb-1">
                Таймер раунда:
              </label>
              <select
                disabled={!isHost}
                value={room.settings.roundTimerSeconds}
                onChange={(e) =>
                  updateBunkerSettings(room.code, {
                    roundTimerSeconds: Number(e.target.value),
                  })
                }
                className="w-full bg-bunker-950 border border-bunker-700 rounded-xl px-2.5 py-2 text-sm font-mono text-zinc-100 disabled:opacity-70"
              >
                <option value={60}>60 секунд</option>
                <option value={90}>90 секунд</option>
                <option value={120}>120 секунд</option>
                <option value={0}>Вручную</option>
              </select>
            </div>
          </div>

          {/* What is in the bunker (supplies) */}
          <div>
            <label className="block text-xs font-mono uppercase text-zinc-400 mb-1.5 flex items-center gap-1.5">
              <Package className="w-3.5 h-3.5 text-emerald-400" />
              Что есть в бункере (запасы, фильтры, гидропоника, оружие):
            </label>
            <textarea
              rows={2}
              disabled={!isHost}
              value={room.settings.supplies}
              onChange={(e) =>
                updateBunkerSettings(room.code, { supplies: e.target.value })
              }
              className="w-full bg-bunker-950 border border-bunker-700 rounded-xl p-3 text-xs sm:text-sm text-zinc-200 focus:outline-none focus:border-amber-500 disabled:opacity-75"
            />
          </div>

          {/* Catastrophe / General Info */}
          <div>
            <label className="block text-xs font-mono uppercase text-zinc-400 mb-1.5 flex items-center gap-1.5">
              <ShieldAlert className="w-3.5 h-3.5 text-red-400" />
              Общая информация / Катастрофа:
            </label>
            <textarea
              rows={3}
              disabled={!isHost}
              value={room.settings.catastrophe}
              onChange={(e) =>
                updateBunkerSettings(room.code, { catastrophe: e.target.value })
              }
              className="w-full bg-bunker-950 border border-bunker-700 rounded-xl p-3 text-xs sm:text-sm text-zinc-200 focus:outline-none focus:border-amber-500 disabled:opacity-75"
            />
          </div>
        </div>
      </div>
    </div>
  );
};

