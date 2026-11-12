import React, { useState, useEffect } from 'react';
import {
  User,
  ShieldAlert,
  Users,
  Vote,
  ScrollText,
  Eye,
  EyeOff,
  Info,
  Zap,
  Clock,
  CheckCircle2,
  Lock,
  Crown,
  SkipForward,
  Gavel,
  Send,
  AlertTriangle,
  UserCheck,
  UserX,
  RotateCcw,
  DoorOpen,
  Play,
  Pause,
  Wrench,
  HeartPulse,
  Sparkles,
  Shuffle,
  Loader2,
  Check,
} from 'lucide-react';
import {
  ATTRIBUTE_METADATA,
  AttributeCard,
  AttributeKey,
  PlayerData,
  RoomData,
} from '../types/game';
import {
  addLogMessage,
  advanceTurn,
  castVote,
  finalizeVoting,
  hostCurePlayerCondition,
  hostForceToggleReveal,
  hostReplaceAttributeCard,
  hostSetPlayerStatus,
  pauseTimerManual,
  removeOrLeavePlayer,
  resetTimerManual,
  revealAttribute,
  startRevoteAfterDefense,
  startTimerManual,
  startVoting,
  transferHost,
  triggerStandardFinale,
} from '../services/firebaseService';
import { AbilitySheetModal } from './AbilitySheetModal';
import { sound } from '../services/soundService';

interface GameScreenProps {
  room: RoomData;
  currentUserUid: string;
}

type MobileTab = 'my-card' | 'bunker' | 'survivors' | 'voting' | 'logs';

export const GameScreen: React.FC<GameScreenProps> = ({ room, currentUserUid }) => {
  const [activeTab, setActiveTab] = useState<MobileTab>('my-card');
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [chatInput, setChatInput] = useState<string>('');
  const [actionError, setActionError] = useState<string | null>(null);

  // Track which exile modal IDs have been dismissed by the user via "ОК"
  const [dismissedExileId, setDismissedExileId] = useState<string | null>(null);

  // Voting debounce / lock state (Section 3)
  const [isSubmittingVote, setIsSubmittingVote] = useState<boolean>(false);
  const [pendingVoteTargetUid, setPendingVoteTargetUid] = useState<string | null>(null);

  // Host God Mode / In-Game Admin Panel state (Section 4)
  const [openAdminToolsUid, setOpenAdminToolsUid] = useState<string | null>(null);
  const [adminAttrKey, setAdminAttrKey] = useState<AttributeKey>('profession');
  const [adminCustomText, setAdminCustomText] = useState<string>('');
  const [adminBusy, setAdminBusy] = useState<boolean>(false);

  // Ability sheet modal state
  const [abilityModal, setAbilityModal] = useState<{
    isOpen: boolean;
    ownerPlayer: PlayerData;
    sourceKey: 'profession' | 'hobby' | 'specialCard';
    card: AttributeCard;
  } | null>(null);

  const playersList = Object.values(room.players || {}).sort(
    (a, b) => a.joinedAt - b.joinedAt
  );
  const alivePlayers = playersList.filter((p) => p.isAlive);
  const currentPlayer = room.players[currentUserUid];
  const isHost =
    room.hostId === currentUserUid || Boolean(currentPlayer?.isHost);

  useEffect(() => {
    if (
      room.status === 'VOTING' ||
      room.status === 'TIE_DEFENSE' ||
      room.status === 'REVOTE'
    ) {
      setActiveTab('voting');
      sound.playAlarm();
    }
  }, [room.status]);

  useEffect(() => {
    if (!room.timerEndAt) {
      if (
        typeof room.timerPausedRemaining === 'number' &&
        room.timerPausedRemaining >= 0
      ) {
        setTimeLeft(room.timerPausedRemaining);
      } else {
        setTimeLeft(null);
      }
      return;
    }
    const updateTimer = () => {
      const diff = Math.max(0, Math.ceil((room.timerEndAt! - Date.now()) / 1000));
      setTimeLeft(diff);
    };
    updateTimer();
    const interval = setInterval(updateTimer, 500);
    return () => clearInterval(interval);
  }, [room.timerEndAt, room.timerPausedRemaining]);

  const formatSeconds = (sec: number | null) => {
    if (sec === null) return '--:--';
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const handleRevealCard = async (key: AttributeKey) => {
    if (!currentPlayer || !currentPlayer.isAlive) return;
    setActionError(null);
    sound.playReveal();
    try {
      await revealAttribute(room.code, currentUserUid, key);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleCastVote = async (targetUid: string) => {
    if (isSubmittingVote) return;
    setActionError(null);
    setIsSubmittingVote(true);
    setPendingVoteTargetUid(targetUid);
    sound.playClick();
    try {
      await castVote(room.code, currentUserUid, targetUid);
      // Brief lock after server confirmation to prevent double-tap race conditions
      await new Promise((resolve) => setTimeout(resolve, 350));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSubmittingVote(false);
      setPendingVoteTargetUid(null);
    }
  };

  const handleSendChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || !currentPlayer) return;
    const msg = chatInput.trim();
    setChatInput('');
    await addLogMessage(room.code, currentPlayer.name, msg);
  };

  const votesMap = room.votes || {};
  const eligibleVoters = alivePlayers.filter((p) => !p.voteModifiers?.voteBlocked);
  const totalVotesCast = Object.keys(votesMap).length;
  const myVotedTargetUid = votesMap[currentUserUid];
  const turnPlayer = room.currentTurnUid ? room.players[room.currentTurnUid] : null;

  // Show Exile Notification Modal if there is a new exile result not yet dismissed
  const activeExileModal =
    room.lastExileResult && room.lastExileResult.id !== dismissedExileId
      ? room.lastExileResult
      : null;

  return (
    <div className="max-w-6xl mx-auto px-3 sm:px-6 pt-3 pb-24 space-y-4">
      {/* Top Status Strip */}
      <div className="p-3.5 rounded-2xl bg-bunker-900 border border-bunker-700 shadow-lg flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="px-3 py-1.5 rounded-xl bg-amber-500/15 border border-amber-500/40 font-mono text-xs font-bold text-amber-300">
            РАУНД {room.round || 1}
          </div>

          <div className="text-xs font-mono">
            {room.status === 'PLAYING' && (
              <span className="text-emerald-400">
                ● Фаза вскрытия карт • Очередь:{' '}
                <strong className="text-zinc-100">
                  {turnPlayer ? turnPlayer.name : 'Свободная'}
                </strong>
              </span>
            )}
            {room.status === 'VOTING' && (
              <span className="text-red-400 font-bold animate-pulse">
                ⚖️ ФАЗА ГОЛОСОВАНИЯ ЗА ИЗГНАНИЕ ({totalVotesCast}/{eligibleVoters.length})
              </span>
            )}
            {room.status === 'TIE_DEFENSE' && (
              <span className="text-amber-400 font-bold animate-pulse">
                ⚠️ НИЧЬЯ! ОПРАВДАТЕЛЬНАЯ РЕЧЬ КАНДИДАТОВ
              </span>
            )}
            {room.status === 'REVOTE' && (
              <span className="text-red-400 font-bold animate-pulse">
                ⚖️ ПОВТОРНОЕ ГОЛОСОВАНИЕ МЕЖДУ ЛИДЕРАМИ ({totalVotesCast}/{eligibleVoters.length})
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {timeLeft !== null && (
            <div
              className={`px-3 py-1.5 rounded-xl font-mono text-sm font-bold flex items-center gap-1.5 border ${
                timeLeft <= 15
                  ? 'bg-red-500/20 border-red-500 text-red-300 animate-pulse'
                  : 'bg-bunker-950 border-bunker-700 text-amber-400'
              }`}
            >
              <Clock className="w-4 h-4" />
              <span>{formatSeconds(timeLeft)}</span>
            </div>
          )}

          <div className="text-xs font-mono px-2.5 py-1.5 rounded-xl bg-bunker-950 border border-bunker-800 text-zinc-300">
            Живы: <strong className="text-emerald-400">{alivePlayers.length}</strong> / Мест:{' '}
            <strong className="text-amber-400">{room.settings.capacity}</strong>
          </div>

          {isHost && room.status === 'PLAYING' && (
            <button
              type="button"
              onClick={() => startVoting(room.code)}
              className="px-3 py-1.5 rounded-xl bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 text-red-300 text-xs font-mono font-bold flex items-center gap-1.5 transition"
            >
              <Gavel className="w-3.5 h-3.5" />
              Начать голосование
            </button>
          )}
        </div>
      </div>

      {/* Spectator Notice if Exiled */}
      {currentPlayer && !currentPlayer.isAlive && (
        <div className="p-3 rounded-xl bg-red-500/15 border border-red-500/40 text-xs text-red-200 flex items-center justify-between">
          <span>
            🚪 Вы были изгнаны из бункера и находитесь в статусе <strong>«Наблюдатель»</strong>. Вы можете следить за ходом игры и итогами голосования.
          </span>
        </div>
      )}

      {actionError && (
        <div className="p-3 rounded-xl bg-red-500/15 border border-red-500/40 text-xs text-red-200 flex items-center justify-between">
          <span>{actionError}</span>
          <button onClick={() => setActionError(null)} className="text-xs underline">
            Скрыть
          </button>
        </div>
      )}

      {/* Desktop Top Navigation Bar */}
      <div className="hidden sm:grid sm:grid-cols-5 gap-2 bg-bunker-900 p-1.5 rounded-2xl border border-bunker-700">
        {[
          { id: 'my-card', label: '1. Моя карта (11)', icon: User },
          { id: 'bunker', label: '2. Бункер', icon: ShieldAlert },
          { id: 'survivors', label: `3. Выжившие (${alivePlayers.length})`, icon: Users },
          {
            id: 'voting',
            label: '4. Голосование',
            icon: Vote,
            alert:
              room.status === 'VOTING' ||
              room.status === 'TIE_DEFENSE' ||
              room.status === 'REVOTE',
          },
          { id: 'logs', label: `5. Журнал (${(room.logs || []).length})`, icon: ScrollText },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                sound.playClick();
                setActiveTab(tab.id as MobileTab);
              }}
              className={`py-2.5 px-3 rounded-xl font-mono text-xs font-bold transition flex items-center justify-center gap-2 relative ${
                isActive
                  ? 'bg-amber-500 text-bunker-950 shadow'
                  : 'text-zinc-400 hover:text-zinc-100 hover:bg-bunker-800'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
              {tab.alert && !isActive && (
                <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping absolute top-1.5 right-1.5" />
              )}
            </button>
          );
        })}
      </div>

      {/* ===================================================================== */}
      {/* TAB 1: МОЯ КАРТА (11 ХАРАКТЕРИСТИК + СПЕЦ. СПОСОБНОСТИ ℹ️)             */}
      {/* ===================================================================== */}
      {activeTab === 'my-card' && currentPlayer && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-base sm:text-lg font-bold text-zinc-100 flex items-center gap-2">
                <span>Личное досье выжившего: {currentPlayer.name}</span>
                {currentPlayer.isAlive ? (
                  <span className="text-xs font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    В очереди в бункер
                  </span>
                ) : (
                  <span className="text-xs font-mono px-2 py-0.5 rounded bg-red-500/20 text-red-300 border border-red-500/30">
                    Изгнан (Наблюдатель)
                  </span>
                )}
              </h3>
              <p className="text-xs text-zinc-400">
                Открывайте по 1–2 характеристики за раунд. Нажмите на пульсирующую иконку{' '}
                <span className="text-amber-400 font-mono">ℹ️</span> возле профессии, хобби или спецкарты для активации способности.
              </p>
            </div>
            <div className="text-xs font-mono text-amber-400 bg-amber-500/10 border border-amber-500/30 px-3 py-1.5 rounded-xl">
              Вскрыто в этом раунде: {currentPlayer.revealedInRound || 0}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {ATTRIBUTE_METADATA.map((meta, idx) => {
              const card = currentPlayer.attributes[meta.key];
              if (!card) return null;

              const hasAbility = Boolean(card.ability);
              const abilityKey = meta.key as 'profession' | 'hobby' | 'specialCard';

              return (
                <div
                  key={meta.key}
                  className={`p-4 rounded-2xl border transition flex flex-col justify-between gap-3 ${
                    meta.key === 'specialCard'
                      ? 'md:col-span-2 bg-gradient-to-r from-bunker-900 via-bunker-900 to-amber-950/30 border-amber-500/40'
                      : card.revealed
                      ? 'bg-bunker-900/95 border-emerald-500/40'
                      : 'bg-bunker-900/70 border-bunker-700 hover:border-bunker-500'
                  }`}
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-md bg-bunker-800 text-zinc-400 font-mono text-[11px] flex items-center justify-center">
                          {idx + 1}
                        </span>
                        <span className="text-xs font-mono uppercase tracking-wider text-amber-400 font-semibold">
                          {meta.label}
                        </span>

                        {hasAbility && card.ability && (
                          <button
                            type="button"
                            onClick={() => {
                              sound.playClick();
                              setAbilityModal({
                                isOpen: true,
                                ownerPlayer: currentPlayer,
                                sourceKey: abilityKey,
                                card,
                              });
                            }}
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-mono border transition ${
                              card.ability.used
                                ? 'bg-zinc-800 border-zinc-700 text-zinc-400'
                                : 'bg-amber-500/20 border-amber-400 text-amber-300 animate-glow hover:bg-amber-500/30'
                            }`}
                            title="Описание и активация спец. способности"
                          >
                            <Info className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
                            <span>ℹ️ {card.ability.name}</span>
                          </button>
                        )}
                      </div>

                      {card.revealed ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-mono text-emerald-400 bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-0.5 rounded-full">
                          <Eye className="w-3 h-3" /> Открыто всем
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-mono text-zinc-400 bg-bunker-950 border border-bunker-700 px-2.5 py-0.5 rounded-full">
                          <EyeOff className="w-3 h-3" /> Скрыто
                        </span>
                      )}
                    </div>

                    <div className="text-sm sm:text-base font-bold text-zinc-100 leading-snug">
                      {card.text}
                    </div>

                    {card.condition && (
                      <div className="text-xs text-zinc-400">{card.condition}</div>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-bunker-800/80">
                    {!card.revealed && meta.key !== 'specialCard' ? (
                      <button
                        type="button"
                        disabled={!currentPlayer.isAlive}
                        onClick={() => handleRevealCard(meta.key)}
                        className="px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-bunker-950 font-bold text-xs font-mono uppercase tracking-wider transition flex items-center gap-1.5"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        Вскрыть для всех
                      </button>
                    ) : (
                      <span className="text-[11px] font-mono text-zinc-500">
                        {meta.key === 'specialCard'
                          ? 'Одноразовая тактическая карта действия'
                          : 'Карта видна в общей сводке стола'}
                      </span>
                    )}

                    {hasAbility && card.ability && (
                      <button
                        type="button"
                        onClick={() => {
                          sound.playClick();
                          setAbilityModal({
                            isOpen: true,
                            ownerPlayer: currentPlayer,
                            sourceKey: abilityKey,
                            card,
                          });
                        }}
                        className={`px-3 py-1.5 rounded-xl text-xs font-mono font-semibold flex items-center gap-1.5 transition ${
                          card.ability.used
                            ? 'bg-bunker-800 text-zinc-400'
                            : 'bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300'
                        }`}
                      >
                        <Zap className="w-3.5 h-3.5" />
                        {card.ability.used ? 'Способность использована' : 'Спец. способность ℹ️'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 2: БУНКЕР                                                         */}
      {/* ===================================================================== */}
      {activeTab === 'bunker' && (
        <div className="space-y-4">
          <div className="p-5 rounded-2xl bg-gradient-to-br from-red-950/40 via-bunker-900 to-bunker-900 border-2 border-red-500/40 space-y-2">
            <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-red-400">
              <ShieldAlert className="w-4 h-4" />
              СВОДКА О КАТАСТРОФЕ И ВНЕШНЕМ МИРЕ
            </div>
            <p className="text-sm sm:text-base text-zinc-100 leading-relaxed font-medium">
              {room.settings.catastrophe}
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-4 rounded-2xl bg-bunker-900 border border-bunker-700">
              <div className="text-xs font-mono text-zinc-400 uppercase">Вместимость</div>
              <div className="text-2xl font-mono font-black text-amber-400 mt-1">
                {room.settings.capacity} чел.
              </div>
              <div className="text-[11px] text-zinc-500 mt-0.5">
                Сейчас претендуют: {alivePlayers.length}
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-bunker-900 border border-bunker-700">
              <div className="text-xs font-mono text-zinc-400 uppercase">Время изоляции</div>
              <div className="text-2xl font-mono font-black text-zinc-100 mt-1">
                {room.settings.duration}
              </div>
              <div className="text-[11px] text-zinc-500 mt-0.5">Автономный цикл</div>
            </div>

            <div className="p-4 rounded-2xl bg-bunker-900 border border-bunker-700">
              <div className="text-xs font-mono text-zinc-400 uppercase">Площадь бункера</div>
              <div className="text-2xl font-mono font-black text-emerald-400 mt-1">
                {room.settings.size} м²
              </div>
              <div className="text-[11px] text-zinc-500 mt-0.5">Герметичный контур</div>
            </div>

            <div className="p-4 rounded-2xl bg-bunker-900 border border-bunker-700">
              <div className="text-xs font-mono text-zinc-400 uppercase">Таймер обсуждения</div>
              <div className="text-2xl font-mono font-black text-amber-300 mt-1">
                {formatSeconds(timeLeft ?? (room.settings.roundTimerSeconds || 90))}
              </div>
              <div className="text-[11px] text-zinc-500 mt-0.5">
                {room.timerEndAt
                  ? '● Отсчёт запущен'
                  : room.timerPausedRemaining != null
                  ? '⏸ На паузе'
                  : '⏹ Ожидание запуска'}
              </div>
            </div>
          </div>

          {/* MANUAL PASSIVE TIMER CONTROLS (Section 1: Exclusively in Bunker Tab) */}
          <div className="p-4 sm:p-5 rounded-2xl bg-bunker-900 border-2 border-amber-500/40 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-xs font-mono uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                  <Clock className="w-4 h-4" />
                  РУЧНОЕ УПРАВЛЕНИЕ ТАЙМЕРОМ ОБСУЖДЕНИЯ / РАУНДА
                </div>
                <p className="text-[11px] text-zinc-400 mt-0.5">
                  Таймер работает в пассивном режиме (визуальный помощник) и не переключает фазы игры автоматически.
                </p>
              </div>
              <div
                className={`px-4 py-1.5 rounded-xl font-mono text-xl font-black border ${
                  room.timerEndAt && timeLeft !== null && timeLeft <= 15
                    ? 'bg-red-500/20 border-red-500 text-red-300 animate-pulse'
                    : room.timerEndAt
                    ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                    : 'bg-bunker-950 border-bunker-700 text-amber-400'
                }`}
              >
                {formatSeconds(timeLeft ?? (room.settings.roundTimerSeconds || 90))}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <div className="flex flex-wrap items-center gap-2">
                {!room.timerEndAt ? (
                  <button
                    type="button"
                    onClick={() => {
                      sound.playClick();
                      startTimerManual(room.code);
                    }}
                    className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-bunker-950 font-bold text-xs font-mono uppercase flex items-center gap-1.5 transition shadow"
                  >
                    <Play className="w-3.5 h-3.5" />
                    <span>
                      {room.timerPausedRemaining != null ? 'Продолжить' : 'Старт'}
                    </span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      sound.playClick();
                      pauseTimerManual(room.code);
                    }}
                    className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-bunker-950 font-bold text-xs font-mono uppercase flex items-center gap-1.5 transition shadow"
                  >
                    <Pause className="w-3.5 h-3.5" />
                    <span>Пауза</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    sound.playClick();
                    resetTimerManual(
                      room.code,
                      room.settings.roundTimerSeconds || 90
                    );
                  }}
                  className="px-3.5 py-2 rounded-xl bg-bunker-800 hover:bg-bunker-700 border border-bunker-600 text-zinc-200 text-xs font-mono flex items-center gap-1.5 transition"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Сброс</span>
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] font-mono text-zinc-500 mr-1">
                  Длительность:
                </span>
                {[30, 60, 90, 120, 180].map((sec) => (
                  <button
                    key={sec}
                    type="button"
                    onClick={() => {
                      sound.playClick();
                      resetTimerManual(room.code, sec);
                    }}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-mono transition ${
                      (room.settings.roundTimerSeconds || 90) === sec
                        ? 'bg-amber-500 text-bunker-950 font-bold'
                        : 'bg-bunker-950 hover:bg-bunker-800 border border-bunker-700 text-zinc-300'
                    }`}
                  >
                    {sec}с
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-bunker-900 border border-bunker-700 space-y-2">
            <div className="text-xs font-mono uppercase tracking-wider text-emerald-400">
              ЧТО ЕСТЬ В БУНКЕРЕ (ОБОРУДОВАНИЕ, ЗАПАСЫ И МОДЕРНИЗАЦИИ):
            </div>
            <p className="text-sm sm:text-base text-zinc-200 leading-relaxed">
              {room.settings.supplies}
            </p>
            <div className="text-xs font-mono text-zinc-500 pt-1">
              Используемые паки: {(room.settings.packNames || []).join(', ') || 'Базовый'}
            </div>
          </div>

          {isHost && (
            <div className="p-4 sm:p-5 rounded-2xl bg-bunker-950 border border-amber-500/40 space-y-3">
              <div className="text-xs font-mono uppercase text-amber-400 flex items-center gap-1.5">
                <Crown className="w-4 h-4" /> Пульт управления фазами игры (Хост)
              </div>
              <div className="flex flex-wrap gap-2.5">
                <button
                  type="button"
                  onClick={() => advanceTurn(room.code)}
                  className="px-3.5 py-2 rounded-xl bg-bunker-800 hover:bg-bunker-700 text-zinc-200 text-xs font-mono flex items-center gap-1.5"
                >
                  <SkipForward className="w-3.5 h-3.5 text-amber-400" />
                  Следующий игрок по очереди
                </button>
                <button
                  type="button"
                  onClick={() => {
                    sound.playClick();
                    setActiveTab('survivors');
                    if (!openAdminToolsUid && playersList[0]) {
                      setOpenAdminToolsUid(playersList[0].uid);
                    }
                  }}
                  className="px-3.5 py-2 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-300 text-xs font-mono flex items-center gap-1.5"
                >
                  <Wrench className="w-3.5 h-3.5" />
                  Админ-инструменты игроков (Режим Бога)
                </button>
                <button
                  type="button"
                  onClick={() => startVoting(room.code)}
                  className="px-4 py-2 rounded-xl bg-red-500 hover:bg-red-400 text-bunker-950 font-bold text-xs font-mono uppercase flex items-center gap-1.5"
                >
                  <Gavel className="w-3.5 h-3.5" />
                  Запустить голосование
                </button>
                <button
                  type="button"
                  onClick={() => triggerStandardFinale(room.code)}
                  className="px-3.5 py-2 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-300 text-xs font-mono flex items-center gap-1.5"
                >
                  <Lock className="w-3.5 h-3.5" />
                  Завершить отбор (Финал)
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 3: ВЫЖИВШИЕ                                                       */}
      {/* ===================================================================== */}
      {activeTab === 'survivors' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base sm:text-lg font-bold text-zinc-100">
              Сводка стола: Все участники ({playersList.length})
            </h3>
            <span className="text-xs font-mono text-zinc-400">
              Нажмите ℹ️ на открытой профессии или хобби для просмотра способности
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {playersList.map((player) => {
              const revealedCount = ATTRIBUTE_METADATA.filter(
                (m) => m.key !== 'specialCard' && player.attributes[m.key]?.revealed
              ).length;
              const isCurrentTurn = room.currentTurnUid === player.uid;

              return (
                <div
                  key={player.uid}
                  className={`p-4 rounded-2xl border transition space-y-3 ${
                    !player.isAlive
                      ? 'bg-bunker-950/60 border-red-900/40 opacity-75'
                      : isCurrentTurn
                      ? 'bg-bunker-900 border-amber-500 shadow-lg shadow-amber-500/5'
                      : 'bg-bunker-900 border-bunker-700'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 border-b border-bunker-800 pb-2.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-base font-bold text-zinc-100">
                        {player.name}
                      </span>
                      {player.uid === currentUserUid && (
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300">
                          Вы
                        </span>
                      )}
                      {player.isHost && (
                        <Crown className="w-4 h-4 text-amber-400" title="Хост" />
                      )}
                      {isCurrentTurn && player.isAlive && (
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500 text-bunker-950 font-bold">
                          ХОД ИГРОКА
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 flex-wrap">
                      {player.isAlive ? (
                        <span className="text-xs font-mono text-emerald-400 bg-emerald-500/15 px-2.5 py-0.5 rounded-full border border-emerald-500/30">
                          В игре ({revealedCount}/10)
                        </span>
                      ) : (
                        <span className="text-xs font-mono text-red-400 bg-red-500/15 px-2.5 py-0.5 rounded-full border border-red-500/30">
                          Изгнан (Наблюдатель)
                        </span>
                      )}

                      {isHost && (
                        <button
                          type="button"
                          onClick={() => {
                            sound.playClick();
                            if (openAdminToolsUid === player.uid) {
                              setOpenAdminToolsUid(null);
                            } else {
                              setOpenAdminToolsUid(player.uid);
                              setAdminCustomText(
                                player.attributes[adminAttrKey]?.text || ''
                              );
                            }
                          }}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-mono flex items-center gap-1 border transition ${
                            openAdminToolsUid === player.uid
                              ? 'bg-amber-500 text-bunker-950 border-amber-400 font-bold'
                              : 'bg-bunker-950 hover:bg-bunker-800 text-amber-300 border-amber-500/40'
                          }`}
                          title="Открыть панель администратора игры (Режим Бога) для этого игрока"
                        >
                          <Wrench className="w-3 h-3" />
                          <span>Админ-инструменты</span>
                        </button>
                      )}

                      {isHost && player.uid !== currentUserUid && (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => transferHost(room.code, player.uid)}
                            className="p-1 text-zinc-500 hover:text-amber-400"
                            title="Передать права Хоста"
                          >
                            <UserCheck className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* HOST GOD MODE / IN-GAME ADMIN TOOLS DRAWER (Section 4) */}
                  {isHost && openAdminToolsUid === player.uid && (
                    <div className="p-3.5 rounded-xl bg-bunker-950 border-2 border-amber-500/50 space-y-3 animate-fadeIn">
                      <div className="flex items-center justify-between gap-2 border-b border-bunker-800 pb-2">
                        <span className="text-xs font-mono uppercase text-amber-400 font-bold flex items-center gap-1.5">
                          <Wrench className="w-3.5 h-3.5" />
                          Режим Бога // Управление игроком: {player.name}
                        </span>
                        <span className="text-[10px] font-mono text-zinc-500">
                          Все действия записываются в журнал
                        </span>
                      </div>

                      {/* 1. Health, Phobia & Alive/Spectator Status Controls */}
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          disabled={adminBusy}
                          onClick={async () => {
                            setAdminBusy(true);
                            sound.playReveal();
                            try {
                              await hostCurePlayerCondition(
                                room.code,
                                player.uid,
                                'health'
                              );
                            } finally {
                              setAdminBusy(false);
                            }
                          }}
                          className="px-2.5 py-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 text-emerald-300 text-xs font-mono flex items-center gap-1 transition"
                        >
                          <HeartPulse className="w-3.5 h-3.5" />
                          <span>Вылечить болезнь</span>
                        </button>

                        <button
                          type="button"
                          disabled={adminBusy}
                          onClick={async () => {
                            setAdminBusy(true);
                            sound.playReveal();
                            try {
                              await hostCurePlayerCondition(
                                room.code,
                                player.uid,
                                'phobia'
                              );
                            } finally {
                              setAdminBusy(false);
                            }
                          }}
                          className="px-2.5 py-1.5 rounded-lg bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/40 text-cyan-300 text-xs font-mono flex items-center gap-1 transition"
                        >
                          <Sparkles className="w-3.5 h-3.5" />
                          <span>Снять фобию</span>
                        </button>

                        <button
                          type="button"
                          disabled={adminBusy}
                          onClick={async () => {
                            setAdminBusy(true);
                            sound.playClick();
                            try {
                              await hostSetPlayerStatus(
                                room.code,
                                player.uid,
                                !player.isAlive
                              );
                            } finally {
                              setAdminBusy(false);
                            }
                          }}
                          className={`px-2.5 py-1.5 rounded-lg text-xs font-mono flex items-center gap-1 border transition ${
                            player.isAlive
                              ? 'bg-red-500/15 hover:bg-red-500/25 border-red-500/40 text-red-300'
                              : 'bg-amber-500 hover:bg-amber-400 border-amber-400 text-bunker-950 font-bold'
                          }`}
                        >
                          {player.isAlive ? (
                            <>
                              <UserX className="w-3.5 h-3.5" />
                              <span>Изгнать (В наблюдатели)</span>
                            </>
                          ) : (
                            <>
                              <UserCheck className="w-3.5 h-3.5" />
                              <span>Вернуть в игру (Жив)</span>
                            </>
                          )}
                        </button>
                      </div>

                      {/* 2. Force Reveal & Replace Any of 11 Attributes */}
                      <div className="space-y-2 pt-1 border-t border-bunker-800">
                        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
                          <div className="sm:col-span-5">
                            <select
                              value={adminAttrKey}
                              onChange={(e) => {
                                const nextKey = e.target.value as AttributeKey;
                                setAdminAttrKey(nextKey);
                                setAdminCustomText(
                                  player.attributes[nextKey]?.text || ''
                                );
                              }}
                              className="w-full h-9 bg-bunker-900 border border-bunker-700 rounded-lg px-2.5 text-xs font-mono text-amber-300 focus:outline-none focus:border-amber-500"
                            >
                              {ATTRIBUTE_METADATA.map((m) => (
                                <option key={m.key} value={m.key}>
                                  {m.label}{' '}
                                  {player.attributes[m.key]?.revealed
                                    ? '(Открыто)'
                                    : '(Скрыто)'}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="sm:col-span-7 flex flex-wrap gap-1.5">
                            <button
                              type="button"
                              disabled={adminBusy}
                              onClick={async () => {
                                setAdminBusy(true);
                                sound.playReveal();
                                try {
                                  await hostForceToggleReveal(
                                    room.code,
                                    player.uid,
                                    adminAttrKey
                                  );
                                } finally {
                                  setAdminBusy(false);
                                }
                              }}
                              className="px-2.5 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 text-xs font-mono flex items-center gap-1 transition"
                            >
                              {player.attributes[adminAttrKey]?.revealed ? (
                                <>
                                  <EyeOff className="w-3.5 h-3.5" />
                                  <span>Скрыть карту</span>
                                </>
                              ) : (
                                <>
                                  <Eye className="w-3.5 h-3.5" />
                                  <span>Вскрыть для всех</span>
                                </>
                              )}
                            </button>

                            <button
                              type="button"
                              disabled={adminBusy}
                              onClick={async () => {
                                setAdminBusy(true);
                                sound.playReveal();
                                try {
                                  await hostReplaceAttributeCard(
                                    room.code,
                                    player.uid,
                                    adminAttrKey,
                                    'random'
                                  );
                                } finally {
                                  setAdminBusy(false);
                                }
                              }}
                              className="px-2.5 py-1.5 rounded-lg bg-bunker-800 hover:bg-bunker-700 border border-bunker-600 text-zinc-200 text-xs font-mono flex items-center gap-1 transition"
                              title="Случайно заменить характеристику из подключённых паков"
                            >
                              <Shuffle className="w-3.5 h-3.5 text-amber-400" />
                              <span>Случайная из пака</span>
                            </button>
                          </div>
                        </div>

                        <div className="text-[11px] font-mono text-zinc-400">
                          Текущее значение:{' '}
                          <span className="text-zinc-200">
                            {player.attributes[adminAttrKey]?.text || '—'}
                          </span>
                        </div>

                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={adminCustomText}
                            onChange={(e) => setAdminCustomText(e.target.value)}
                            placeholder="Введите новый текст характеристики вручную..."
                            className="flex-1 h-9 bg-bunker-900 border border-bunker-700 rounded-lg px-3 text-xs text-zinc-100 focus:outline-none focus:border-amber-500"
                          />
                          <button
                            type="button"
                            disabled={adminBusy || !adminCustomText.trim()}
                            onClick={async () => {
                              if (!adminCustomText.trim()) return;
                              setAdminBusy(true);
                              sound.playClick();
                              try {
                                await hostReplaceAttributeCard(
                                  room.code,
                                  player.uid,
                                  adminAttrKey,
                                  'custom',
                                  adminCustomText.trim()
                                );
                                setAdminCustomText('');
                              } finally {
                                setAdminBusy(false);
                              }
                            }}
                            className="px-3 h-9 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-bunker-950 font-bold text-xs font-mono flex items-center gap-1 shrink-0 transition"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>Заменить</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 gap-1.5 text-xs">
                    {ATTRIBUTE_METADATA.filter((m) => m.key !== 'specialCard').map((meta) => {
                      const card = player.attributes[meta.key];
                      if (!card) return null;
                      const isRevealed = card.revealed;

                      return (
                        <div
                          key={meta.key}
                          className={`px-2.5 py-1.5 rounded-lg flex items-center justify-between gap-2 ${
                            isRevealed
                              ? 'bg-bunker-950 border border-bunker-800 text-zinc-200'
                              : 'bg-bunker-950/40 text-zinc-600'
                          }`}
                        >
                          <span className="font-mono text-[11px] text-zinc-400 shrink-0">
                            {meta.shortLabel}:
                          </span>
                          <div className="flex items-center gap-1.5 min-w-0 justify-end text-right">
                            {isRevealed ? (
                              <>
                                <span className="font-medium text-zinc-100 truncate">
                                  {card.text}
                                </span>
                                {card.ability && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      sound.playClick();
                                      setAbilityModal({
                                        isOpen: true,
                                        ownerPlayer: player,
                                        sourceKey: meta.key as 'profession' | 'hobby',
                                        card,
                                      });
                                    }}
                                    className="px-1.5 py-0.5 rounded bg-amber-500/20 border border-amber-500/40 text-amber-300 font-mono text-[10px] shrink-0 hover:bg-amber-500/30"
                                    title="Посмотреть спец. способность"
                                  >
                                    ℹ️
                                  </button>
                                )}
                              </>
                            ) : (
                              <span className="font-mono text-[11px] text-zinc-600 flex items-center gap-1">
                                <Lock className="w-3 h-3" /> [ЗАСЕКРЕЧЕНО]
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 4: ГОЛОСОВАНИЕ                                                    */}
      {/* ===================================================================== */}
      {activeTab === 'voting' && (
        <div className="space-y-4">
          {room.status === 'PLAYING' ? (
            <div className="p-8 rounded-2xl bg-bunker-900 border border-bunker-700 text-center space-y-4">
              <Vote className="w-12 h-12 text-amber-400 mx-auto opacity-80" />
              <div className="space-y-1">
                <h3 className="text-lg font-bold text-zinc-100">
                  Голосование ещё не запущено
                </h3>
                <p className="text-xs sm:text-sm text-zinc-400 max-w-md mx-auto">
                  Сейчас идёт фаза вскрытия характеристик и обсуждения (Раунд {room.round}). Когда все выскажутся, Хост запустит тайное голосование.
                </p>
              </div>
              {isHost && (
                <button
                  type="button"
                  onClick={() => startVoting(room.code)}
                  className="px-6 py-3 rounded-xl bg-red-500 hover:bg-red-400 text-bunker-950 font-black text-xs font-mono uppercase tracking-wider transition inline-flex items-center gap-2"
                >
                  <Gavel className="w-4 h-4" />
                  Запустить голосование за изгнание сейчас
                </button>
              )}
            </div>
          ) : room.status === 'TIE_DEFENSE' ? (
            <div className="p-6 rounded-2xl bg-amber-500/10 border-2 border-amber-500 space-y-5 text-center">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-amber-500 text-bunker-950 font-mono font-black text-xs uppercase">
                <AlertTriangle className="w-4 h-4" />
                РАВЕНСТВО ГОЛОСОВ — ОПРАВДАТЕЛЬНАЯ РЕЧЬ КАНДИДАТОВ
              </div>

              <p className="text-sm text-zinc-200 max-w-xl mx-auto">
                Следующие кандидаты набрали одинаковое максимальное число голосов. Дайте каждому кандидату слово для оправдательной речи перед повторным голосованием (при необходимости запустите таймер во вкладке «Бункер»):
              </p>

              <div className="flex flex-wrap justify-center gap-3">
                {(room.tiedCandidates || []).map((uid) => {
                  const p = room.players[uid];
                  if (!p) return null;
                  return (
                    <div
                      key={uid}
                      className="px-5 py-3 rounded-xl bg-bunker-950 border-2 border-amber-500/60 text-amber-300 font-bold text-base"
                    >
                      🎙️ {p.name} ({room.lastVoteTally?.[uid] || 0} гол.)
                    </div>
                  );
                })}
              </div>

              {isHost && (
                <button
                  type="button"
                  onClick={() => startRevoteAfterDefense(room.code)}
                  className="px-6 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-bunker-950 font-black text-xs font-mono uppercase tracking-wider transition"
                >
                  Перейти к повторному голосованию между лидерами
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-red-950/30 border border-red-500/40 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-red-200">
                    {room.status === 'REVOTE'
                      ? 'Повторное голосование (только среди лидеров антирейтинга)'
                      : `Тайное голосование за изгнание — Раунд ${room.round}`}
                  </h3>
                  <p className="text-xs text-zinc-400">
                    Выберите одного кандидата, который должен покинуть бункер. Подтверждено сервером:{' '}
                    <strong className="text-zinc-100">
                      {totalVotesCast} из {eligibleVoters.length}
                    </strong>
                  </p>
                </div>

                {isHost && (
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={isSubmittingVote}
                      onClick={() => finalizeVoting(room.code, 'random')}
                      className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-bunker-950 font-black text-xs font-mono uppercase transition"
                    >
                      Завершить голосование и подвести итог
                    </button>
                    {room.status === 'REVOTE' && (
                      <button
                        type="button"
                        disabled={isSubmittingVote}
                        onClick={() => finalizeVoting(room.code, 'skip')}
                        className="px-3 py-2.5 rounded-xl bg-bunker-800 hover:bg-bunker-700 disabled:opacity-50 text-zinc-300 text-xs font-mono flex items-center gap-1"
                        title="При повторной ничьей никого не изгонять"
                      >
                        <RotateCcw className="w-3.5 h-3.5" /> При ничьей оставить всех
                      </button>
                    )}
                  </div>
                )}
              </div>

              {isSubmittingVote && (
                <div className="p-3 rounded-xl bg-amber-500/15 border border-amber-500/40 text-xs font-mono text-amber-300 flex items-center justify-center gap-2 animate-fadeIn">
                  <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
                  <span>Отправка голоса и ожидание подтверждения сервером Firebase...</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {alivePlayers.map((candidate) => {
                  const isEligibleTarget =
                    room.status !== 'REVOTE' ||
                    !room.tiedCandidates ||
                    room.tiedCandidates.length === 0 ||
                    room.tiedCandidates.includes(candidate.uid);

                  const isMyPick = myVotedTargetUid === candidate.uid;
                  const hasCastVote = Boolean(votesMap[candidate.uid]);
                  const isPendingThisCandidate =
                    isSubmittingVote && pendingVoteTargetUid === candidate.uid;

                  // Count confirmed votes against this candidate
                  const confirmedVotesAgainst = Object.entries(votesMap).reduce(
                    (acc, [voterId, targetId]) => {
                      if (targetId !== candidate.uid) return acc;
                      const voterObj = room.players[voterId];
                      if (!voterObj?.isAlive || voterObj.voteModifiers?.voteBlocked) {
                        return acc;
                      }
                      return acc + (voterObj.voteModifiers?.doubleVote ? 2 : 1);
                    },
                    0
                  );

                  return (
                    <div
                      key={candidate.uid}
                      className={`p-4 rounded-2xl border transition flex flex-col justify-between gap-3 ${
                        isMyPick
                          ? 'bg-red-500/20 border-2 border-red-500'
                          : isEligibleTarget
                          ? 'bg-bunker-900 border-bunker-700 hover:border-bunker-500'
                          : 'bg-bunker-950/40 border-bunker-800 opacity-45'
                      }`}
                    >
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-base font-bold text-zinc-100">
                            {candidate.name}
                          </span>
                          <div className="flex items-center gap-1.5">
                            {confirmedVotesAgainst > 0 && (
                              <span className="px-2 py-0.5 rounded-full bg-red-500/20 border border-red-500/40 font-mono text-[11px] font-bold text-red-300">
                                Против: {confirmedVotesAgainst}
                              </span>
                            )}
                            {hasCastVote ? (
                              <span className="text-[11px] font-mono text-emerald-400 flex items-center gap-1">
                                <CheckCircle2 className="w-3.5 h-3.5" /> Проголосовал
                              </span>
                            ) : (
                              <span className="text-[11px] font-mono text-zinc-500">
                                Думает...
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="text-xs text-zinc-300 space-y-1">
                          <div>
                            <span className="text-zinc-500">Профессия: </span>
                            {candidate.attributes.profession?.revealed
                              ? candidate.attributes.profession.text
                              : '[Скрыто]'}
                          </div>
                          <div>
                            <span className="text-zinc-500">Здоровье: </span>
                            {candidate.attributes.health?.revealed
                              ? candidate.attributes.health.text
                              : '[Скрыто]'}
                          </div>
                        </div>

                        {candidate.voteModifiers?.shielded && (
                          <div className="text-[11px] font-mono text-amber-300 bg-amber-500/15 px-2 py-0.5 rounded inline-block">
                            🛡️ Активен щит (-1 голос против)
                          </div>
                        )}
                      </div>

                      {currentPlayer?.isAlive &&
                        !currentPlayer.voteModifiers?.voteBlocked &&
                        isEligibleTarget && (
                          <button
                            type="button"
                            disabled={isSubmittingVote}
                            onClick={() => handleCastVote(candidate.uid)}
                            className={`w-full py-2.5 rounded-xl font-mono text-xs font-bold uppercase transition flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed ${
                              isMyPick
                                ? 'bg-red-500 text-white shadow-lg shadow-red-500/25'
                                : 'bg-bunker-950 hover:bg-red-500/20 border border-bunker-700 hover:border-red-500/40 text-zinc-200 hover:text-red-200'
                            }`}
                          >
                            {isPendingThisCandidate ? (
                              <>
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                <span>Отправка голоса...</span>
                              </>
                            ) : isMyPick ? (
                              <span>✓ Ваш голос подтверждён</span>
                            ) : (
                              <span>Проголосовать против</span>
                            )}
                          </button>
                        )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 5: ЖУРНАЛ СОБЫТИЙ                                                 */}
      {/* ===================================================================== */}
      {activeTab === 'logs' && (
        <div className="p-4 sm:p-5 rounded-2xl bg-bunker-900 border border-bunker-700 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-mono uppercase tracking-wider text-amber-400 flex items-center gap-2">
              <ScrollText className="w-4 h-4" />
              Бортовой журнал событий ({(room.logs || []).length})
            </h3>
          </div>

          <div className="bg-bunker-950 border border-bunker-800 rounded-xl p-3.5 max-h-[52vh] overflow-y-auto space-y-2 font-mono text-xs">
            {(room.logs || [])
              .slice()
              .reverse()
              .map((entry, idx) => (
                <div
                  key={idx}
                  className={`p-2 rounded-lg border-l-2 ${
                    entry.includes('⚡') || entry.includes('🛠️')
                      ? 'bg-amber-500/10 border-amber-400 text-amber-200'
                      : entry.includes('🚪') || entry.includes('⚖️')
                      ? 'bg-red-500/10 border-red-400 text-red-200'
                      : entry.includes('💬')
                      ? 'bg-cyan-500/10 border-cyan-400 text-cyan-200'
                      : 'bg-bunker-900/60 border-emerald-500/50 text-zinc-300'
                  }`}
                >
                  {entry}
                </div>
              ))}
          </div>

          <form onSubmit={handleSendChat} className="flex gap-2">
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Написать реплику в журнал бункера..."
              className="flex-1 bg-bunker-950 border border-bunker-700 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-zinc-100 focus:outline-none focus:border-amber-500"
            />
            <button
              type="submit"
              className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-bunker-950 font-bold text-xs font-mono flex items-center gap-1.5"
            >
              <Send className="w-3.5 h-3.5" />
              Отправить
            </button>
          </form>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MOBILE-FIRST BOTTOM NAVIGATION BAR                                    */}
      {/* ===================================================================== */}
      <nav className="sm:hidden fixed bottom-0 left-0 right-0 z-40 bg-bunker-950/95 backdrop-blur-md border-t border-bunker-700 px-1 py-1.5 grid grid-cols-5 gap-1">
        {[
          { id: 'my-card', label: 'Моя карта', icon: User },
          { id: 'bunker', label: 'Бункер', icon: ShieldAlert },
          { id: 'survivors', label: 'Выжившие', icon: Users },
          {
            id: 'voting',
            label: 'Голосование',
            icon: Vote,
            alert:
              room.status === 'VOTING' ||
              room.status === 'TIE_DEFENSE' ||
              room.status === 'REVOTE',
          },
          { id: 'logs', label: 'Журнал', icon: ScrollText },
        ].map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                sound.playClick();
                setActiveTab(item.id as MobileTab);
              }}
              className={`flex flex-col items-center justify-center py-1.5 rounded-xl transition relative ${
                isActive ? 'text-amber-400 bg-amber-500/10' : 'text-zinc-400'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[10px] font-mono mt-0.5 truncate max-w-full px-1">
                {item.label}
              </span>
              {item.alert && !isActive && (
                <span className="w-2 h-2 rounded-full bg-red-500 animate-ping absolute top-1 right-3" />
              )}
            </button>
          );
        })}
      </nav>

      {/* ===================================================================== */}
      {/* EXILE NOTIFICATION MODAL DIALOG AFTER VOTING (Section 4)              */}
      {/* ===================================================================== */}
      {activeExileModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-fadeIn">
          <div className="max-w-lg w-full bg-bunker-900 border-2 border-red-500 rounded-2xl p-6 space-y-5 shadow-2xl">
            <div className="flex items-center gap-3 text-red-400 border-b border-bunker-700 pb-3">
              <div className="w-11 h-11 rounded-xl bg-red-500/15 border border-red-500/40 flex items-center justify-center shrink-0">
                <DoorOpen className="w-6 h-6" />
              </div>
              <div>
                <span className="text-xs font-mono uppercase tracking-wider text-red-400 block">
                  ИТОГИ ТРИБУНАЛА • РАУНД {activeExileModal.round}
                </span>
                <h3 className="text-lg font-extrabold text-zinc-100">
                  Решение совета выживших
                </h3>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-red-500/15 border border-red-500/40 text-center space-y-1">
              <p className="text-sm sm:text-base font-bold text-zinc-100">
                Большинством голосов из бункера был изгнан:{' '}
                <span className="text-red-300 underline">
                  {activeExileModal.exiledName}
                </span>
              </p>
              <p className="text-xs font-mono text-zinc-400">
                Голосов против кандидата: {activeExileModal.maxVotes} • Переведён в статус «Наблюдатель»
              </p>
            </div>

            {/* Vote Summary Breakdown */}
            <div className="space-y-2">
              <div className="text-xs font-mono uppercase text-amber-400">
                Сводка голосов:
              </div>
              <div className="p-3 rounded-xl bg-bunker-950 border border-bunker-800 space-y-1.5 max-h-44 overflow-y-auto text-xs">
                {Object.entries(activeExileModal.tally || {})
                  .sort((a, b) => b[1] - a[1])
                  .map(([candUid, count]) => {
                    const candName =
                      room.players?.[candUid]?.name || 'Участник';
                    return (
                      <div
                        key={candUid}
                        className="flex items-center justify-between py-1 border-b border-bunker-900 last:border-0"
                      >
                        <span className="font-semibold text-zinc-200">
                          {candName}
                        </span>
                        <span className="font-mono text-amber-400 font-bold">
                          {count} гол.
                        </span>
                      </div>
                    );
                  })}

                {Object.keys(activeExileModal.voterChoices || {}).length > 0 && (
                  <div className="pt-2 mt-2 border-t border-bunker-800 space-y-1 text-[11px] font-mono text-zinc-400">
                    {Object.entries(activeExileModal.voterChoices).map(
                      ([vUid, tUid]) => (
                        <div key={vUid}>
                          • {room.players?.[vUid]?.name || 'Игрок'} → против{' '}
                          <span className="text-zinc-200">
                            {room.players?.[tUid]?.name || 'Кандидата'}
                          </span>
                        </div>
                      )
                    )}
                  </div>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                sound.playClick();
                setDismissedExileId(activeExileModal.id);
              }}
              className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-bunker-950 font-black text-sm font-mono uppercase tracking-wider transition"
            >
              ОК
            </button>
          </div>
        </div>
      )}

      {/* Interactive Ability Sheet Modal */}
      {abilityModal && (
        <AbilitySheetModal
          isOpen={abilityModal.isOpen}
          onClose={() => setAbilityModal(null)}
          room={room}
          currentUserUid={currentUserUid}
          ownerPlayer={abilityModal.ownerPlayer}
          sourceKey={abilityModal.sourceKey}
          card={abilityModal.card}
        />
      )}
    </div>
  );
};
