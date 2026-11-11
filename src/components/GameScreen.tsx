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
  Sparkles,
  UserCheck,
  UserX,
  RotateCcw,
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
  regenerateRoomFinale,
  removeOrLeavePlayer,
  resetOrSetTimer,
  revealAttribute,
  startRevoteAfterDefense,
  startVoting,
  transferHost,
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

  // Automatically switch to 'voting' tab when status becomes VOTING, TIE_DEFENSE, or REVOTE
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

  // Countdown timer sync
  useEffect(() => {
    if (!room.timerEndAt) {
      setTimeLeft(null);
      return;
    }
    const updateTimer = () => {
      const diff = Math.max(0, Math.ceil((room.timerEndAt! - Date.now()) / 1000));
      setTimeLeft(diff);
    };
    updateTimer();
    const interval = setInterval(updateTimer, 500);
    return () => clearInterval(interval);
  }, [room.timerEndAt]);

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
    setActionError(null);
    sound.playClick();
    try {
      await castVote(room.code, currentUserUid, targetUid);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
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

  return (
    <div className="max-w-6xl mx-auto px-3 sm:px-6 pt-3 pb-24 space-y-4">
      {/* Top Status Strip: Round, Phase, Active Turn, Timer & Quick Host Bar */}
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
                ⚠️ НИЧЬЯ! ОПРАВДАТЕЛЬНАЯ РЕЧЬ КАНДИДАТОВ (30 СЕК)
              </span>
            )}
            {room.status === 'REVOTE' && (
              <span className="text-red-400 font-bold animate-pulse">
                ⚖️ ПОВТОРНОЕ ГОЛОСОВАНИЕ МЕЖДУ ЛИДЕРАМИ ({totalVotesCast}/{eligibleVoters.length})
              </span>
            )}
          </div>
        </div>

        {/* Countdown Timer & Host Quick Controls */}
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
            🚪 Вы были изгнаны из бункера и находитесь в режиме <strong>«Наблюдатель»</strong>. Вы видите ход игры и дождётесь финального вердикта ИИ.
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

      {/* Desktop Top Navigation Bar (mirrors mobile Bottom Navigation) */}
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
                    {/* Top Row: Category Badge, Ability ℹ️ Button, and Reveal Status */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-md bg-bunker-800 text-zinc-400 font-mono text-[11px] flex items-center justify-center">
                          {idx + 1}
                        </span>
                        <span className="text-xs font-mono uppercase tracking-wider text-amber-400 font-semibold">
                          {meta.label}
                        </span>

                        {/* Pulsing Interactive Info Icon ℹ️ next to Profession, Hobby & Special Card */}
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

                    {/* Card Main Text */}
                    <div className="text-sm sm:text-base font-bold text-zinc-100 leading-snug">
                      {card.text}
                    </div>

                    {card.condition && (
                      <div className="text-xs text-zinc-400">{card.condition}</div>
                    )}
                  </div>

                  {/* Bottom Action Row: Reveal button & Ability quick button */}
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
      {/* TAB 2: БУНКЕР (КАТАСТРОФА, ЗАПАСЫ, ТАЙМЕР И УПРАВЛЕНИЕ РАУНДОМ)       */}
      {/* ===================================================================== */}
      {activeTab === 'bunker' && (
        <div className="space-y-4">
          {/* Catastrophe Alert Card */}
          <div className="p-5 rounded-2xl bg-gradient-to-br from-red-950/40 via-bunker-900 to-bunker-900 border-2 border-red-500/40 space-y-2">
            <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-red-400">
              <ShieldAlert className="w-4 h-4" />
              СВОДКА О КАТАСТРОФЕ И ВНЕШНЕМ МИРЕ
            </div>
            <p className="text-sm sm:text-base text-zinc-100 leading-relaxed font-medium">
              {room.settings.catastrophe}
            </p>
          </div>

          {/* Bunker Metrics Grid */}
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
                {formatSeconds(timeLeft)}
              </div>
              <div className="text-[11px] text-zinc-500 mt-0.5">
                Пресет: {room.settings.roundTimerSeconds || 'Ручной'} сек
              </div>
            </div>
          </div>

          {/* Supplies & Equipment */}
          <div className="p-5 rounded-2xl bg-bunker-900 border border-bunker-700 space-y-2">
            <div className="text-xs font-mono uppercase tracking-wider text-emerald-400">
              ЧТО ЕСТЬ В БУНКЕРЕ (ОБОРУДОВАНИЕ, ЗАПАСЫ И МОДЕРНИЗАЦИИ):
            </div>
            <p className="text-sm sm:text-base text-zinc-200 leading-relaxed">
              {room.settings.supplies}
            </p>
          </div>

          {/* Host Controls Panel */}
          {isHost && (
            <div className="p-4 sm:p-5 rounded-2xl bg-bunker-950 border border-amber-500/40 space-y-3">
              <div className="text-xs font-mono uppercase text-amber-400 flex items-center gap-1.5">
                <Crown className="w-4 h-4" /> Пульт управления Хоста комнаты
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
                  onClick={() => resetOrSetTimer(room.code, 60)}
                  className="px-3 py-2 rounded-xl bg-bunker-800 hover:bg-bunker-700 text-zinc-200 text-xs font-mono"
                >
                  Таймер 60с
                </button>
                <button
                  type="button"
                  onClick={() => resetOrSetTimer(room.code, 90)}
                  className="px-3 py-2 rounded-xl bg-bunker-800 hover:bg-bunker-700 text-zinc-200 text-xs font-mono"
                >
                  Таймер 90с
                </button>
                <button
                  type="button"
                  onClick={() => resetOrSetTimer(room.code, 120)}
                  className="px-3 py-2 rounded-xl bg-bunker-800 hover:bg-bunker-700 text-zinc-200 text-xs font-mono"
                >
                  Таймер 120с
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
                  onClick={() => regenerateRoomFinale(room.code)}
                  className="px-3.5 py-2 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-300 text-xs font-mono flex items-center gap-1.5"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Досрочный Финал ИИ
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 3: ВЫЖИВШИЕ (ОБЩАЯ СВОДКА СТОЛА И ВСКРЫТЫЕ ХАРАКТЕРИСТИКИ)        */}
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
                  {/* Player Header */}
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

                    <div className="flex items-center gap-2">
                      {player.isAlive ? (
                        <span className="text-xs font-mono text-emerald-400 bg-emerald-500/15 px-2.5 py-0.5 rounded-full border border-emerald-500/30">
                          В игре ({revealedCount}/10)
                        </span>
                      ) : (
                        <span className="text-xs font-mono text-red-400 bg-red-500/15 px-2.5 py-0.5 rounded-full border border-red-500/30">
                          Изгнан
                        </span>
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
                          {player.isAlive && (
                            <button
                              type="button"
                              onClick={() => removeOrLeavePlayer(room.code, player.uid)}
                              className="p-1 text-zinc-500 hover:text-red-400"
                              title="Исключить / Перевести в наблюдатели"
                            >
                              <UserX className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Attributes List */}
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
      {/* TAB 4: ГОЛОСОВАНИЕ (ТРИБУНАЛ, ОПРАВДАТЕЛЬНЫЕ РЕЧИ 30 СЕК, ПЕРЕГОЛОСОВКА) */}
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
            /* 30-SECOND DEFENSE SPEECH PHASE ON TIE */
            <div className="p-6 rounded-2xl bg-amber-500/10 border-2 border-amber-500 space-y-5 text-center">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-amber-500 text-bunker-950 font-mono font-black text-xs uppercase">
                <AlertTriangle className="w-4 h-4" />
                РАВЕНСТВО ГОЛОСОВ — ОПРАВДАТЕЛЬНАЯ РЕЧЬ (30 СЕКУНД)
              </div>

              <div className="text-4xl font-mono font-black text-amber-400">
                {formatSeconds(timeLeft)}
              </div>

              <p className="text-sm text-zinc-200 max-w-xl mx-auto">
                Следующие кандидаты набрали одинаковое максимальное число голосов. У каждого есть 30 секунд на финальную оправдательную речь перед повторным голосованием:
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
            /* ACTIVE VOTING OR REVOTE */
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-red-950/30 border border-red-500/40 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-red-200">
                    {room.status === 'REVOTE'
                      ? 'Повторное голосование (только среди лидеров антирейтинга)'
                      : `Тайное голосование за изгнание — Раунд ${room.round}`}
                  </h3>
                  <p className="text-xs text-zinc-400">
                    Выберите одного кандидата, который должен покинуть бункер. Проголосовало:{' '}
                    <strong className="text-zinc-100">
                      {totalVotesCast} из {eligibleVoters.length}
                    </strong>
                  </p>
                </div>

                {isHost && (
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => finalizeVoting(room.code, 'random')}
                      className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-bunker-950 font-black text-xs font-mono uppercase transition"
                    >
                      Завершить голосование и подвести итог
                    </button>
                    {room.status === 'REVOTE' && (
                      <button
                        type="button"
                        onClick={() => finalizeVoting(room.code, 'skip')}
                        className="px-3 py-2.5 rounded-xl bg-bunker-800 hover:bg-bunker-700 text-zinc-300 text-xs font-mono flex items-center gap-1"
                        title="При повторной ничьей никого не изгонять"
                      >
                        <RotateCcw className="w-3.5 h-3.5" /> При ничьей оставить всех
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Candidate Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {alivePlayers.map((candidate) => {
                  const isEligibleTarget =
                    room.status !== 'REVOTE' ||
                    !room.tiedCandidates ||
                    room.tiedCandidates.length === 0 ||
                    room.tiedCandidates.includes(candidate.uid);

                  const isMyPick = myVotedTargetUid === candidate.uid;
                  const hasCastVote = Boolean(votesMap[candidate.uid]);

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
                            onClick={() => handleCastVote(candidate.uid)}
                            className={`w-full py-2.5 rounded-xl font-mono text-xs font-bold uppercase transition ${
                              isMyPick
                                ? 'bg-red-500 text-white shadow-lg shadow-red-500/25'
                                : 'bg-bunker-950 hover:bg-red-500/20 border border-bunker-700 hover:border-red-500/40 text-zinc-200 hover:text-red-200'
                            }`}
                          >
                            {isMyPick
                              ? '✓ Ваш голос против этого кандидата'
                              : 'Голосовать за изгнание'}
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
      {/* TAB 5: ЖУРНАЛ СОБЫТИЙ И ЧАТ БУНКЕРА                                   */}
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
                    entry.includes('⚡')
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

          {/* Quick Chat Input */}
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
      {/* MOBILE-FIRST BOTTOM NAVIGATION BAR (FIXED ON SMARTPHONES)             */}
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

      {/* Interactive Ability Sheet Modal (Bottom Sheet on mobile / Popover on PC) */}
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

