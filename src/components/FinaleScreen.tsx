import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  ShieldCheck,
  AlertTriangle,
  BookOpen,
  Users,
  RotateCcw,
  RefreshCw,
  Skull,
  Award,
  FastForward,
  Settings,
} from 'lucide-react';
import { ATTRIBUTE_METADATA, RoomData } from '../types/game';
import { backToLobby, regenerateRoomFinale } from '../services/firebaseService';
import { buildFinaleSystemPrompt } from '../services/geminiService';

interface FinaleScreenProps {
  room: RoomData;
  currentUserUid: string;
  onOpenAdmin: () => void;
}

export const FinaleScreen: React.FC<FinaleScreenProps> = ({
  room,
  currentUserUid,
  onOpenAdmin,
}) => {
  const [regenerating, setRegenerating] = useState(false);
  const [activeChapterIdx, setActiveChapterIdx] = useState(0);
  const [typedText, setTypedText] = useState('');
  const [skipAnimation, setSkipAnimation] = useState(false);
  const [showPromptPreview, setShowPromptPreview] = useState(false);

  const summary = room.aiSummary;
  const playersList = Object.values(room.players || {});
  const survivors = playersList.filter((p) => p.isAlive);
  const exiled = playersList.filter((p) => !p.isAlive);
  const isHost =
    room.hostId === currentUserUid ||
    Boolean(room.players[currentUserUid]?.isHost);

  // Trigger initial generation if room entered FINALE without aiSummary yet
  useEffect(() => {
    if (!summary && isHost && !regenerating) {
      setRegenerating(true);
      regenerateRoomFinale(room.code).finally(() => setRegenerating(false));
    }
  }, [summary, isHost, room.code, regenerating]);

  const currentChapter = summary?.chapters?.[activeChapterIdx];

  // Cinematic typewriter effect for active chapter
  useEffect(() => {
    if (!currentChapter) return;
    if (skipAnimation) {
      setTypedText(currentChapter.content);
      return;
    }
    setTypedText('');
    let idx = 0;
    const fullText = currentChapter.content;
    const interval = setInterval(() => {
      idx += 3;
      if (idx >= fullText.length) {
        setTypedText(fullText);
        clearInterval(interval);
      } else {
        setTypedText(fullText.slice(0, idx));
      }
    }, 18);
    return () => clearInterval(interval);
  }, [currentChapter, skipAnimation]);

  const handleRegenerate = async () => {
    setRegenerating(true);
    try {
      await regenerateRoomFinale(room.code);
      setActiveChapterIdx(0);
      setSkipAnimation(false);
    } finally {
      setRegenerating(false);
    }
  };

  if (!summary) {
    return (
      <div className="max-w-3xl mx-auto p-6 my-12 rounded-2xl bg-bunker-900 border-2 border-amber-500/40 text-center space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-amber-500/15 border border-amber-500/40 flex items-center justify-center text-amber-400 mx-auto animate-pulse">
          <Sparkles className="w-8 h-8" />
        </div>
        <h2 className="text-2xl font-black text-zinc-100 font-mono">
          ГЕРМОДВЕРИ ЗАПЕЧАТАНЫ // ГЕНЕРАЦИЯ ЭПИЛОГА ИИ...
        </h2>
        <p className="text-sm text-zinc-400 max-w-md mx-auto">
          Бортовой нейрокомпьютер анализирует совместимость выживших, скрытые болезни, запасы бункера и угрозы внешнего мира на срок {room.settings.duration}.
        </p>
        {!regenerating && (
          <button
            type="button"
            onClick={handleRegenerate}
            className="px-6 py-3 rounded-xl bg-amber-500 text-bunker-950 font-bold text-xs font-mono uppercase"
          >
            Сформировать отчёт выживаемости
          </button>
        )}
      </div>
    );
  }

  const prob = summary.survivalProbability;
  const probColor =
    prob >= 70
      ? 'text-emerald-400 border-emerald-500/50 bg-emerald-500/10'
      : prob >= 40
      ? 'text-amber-400 border-amber-500/50 bg-amber-500/10'
      : 'text-red-400 border-red-500/50 bg-red-500/10';

  return (
    <div className="max-w-5xl mx-auto p-3 sm:p-6 space-y-6 pb-20">
      {/* Top Verdict Hero Banner */}
      <div className="p-6 sm:p-8 rounded-3xl bg-gradient-to-br from-bunker-900 via-bunker-900 to-amber-950/30 border-2 border-amber-500/50 shadow-2xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-bunker-700 pb-4">
          <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-amber-400">
            <Award className="w-4 h-4" />
            <span>
              ФИНАЛЬНЫЙ ВЕРДИКТ ИИ •{' '}
              {summary.source === 'gemini'
                ? `GOOGLE GEMINI (${summary.modelUsed || 'AI'})`
                : 'БОРТОВОЙ АНАЛИЗАТОР БУНКЕРА'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowPromptPreview(!showPromptPreview)}
              className="px-3 py-1.5 rounded-lg bg-bunker-950 border border-bunker-700 text-xs font-mono text-zinc-400 hover:text-zinc-200"
            >
              {showPromptPreview ? 'Скрыть системный промпт' : 'Системный промпт ИИ'}
            </button>
            <button
              type="button"
              onClick={onOpenAdmin}
              className="px-3 py-1.5 rounded-lg bg-bunker-950 border border-bunker-700 text-xs font-mono text-amber-300 hover:border-amber-500 flex items-center gap-1"
            >
              <Settings className="w-3.5 h-3.5" /> Ключ Gemini
            </button>
            <button
              type="button"
              disabled={regenerating}
              onClick={handleRegenerate}
              className="px-3 py-1.5 rounded-lg bg-amber-500/20 border border-amber-500/40 text-xs font-mono text-amber-300 hover:bg-amber-500/30 flex items-center gap-1.5 disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${regenerating ? 'animate-spin' : ''}`} />
              {regenerating ? 'Генерация...' : 'Перегенерировать ИИ'}
            </button>
          </div>
        </div>

        {showPromptPreview && (
          <pre className="p-4 rounded-xl bg-bunker-950 border border-bunker-700 text-[11px] font-mono text-zinc-400 overflow-x-auto max-h-60 whitespace-pre-wrap">
            {buildFinaleSystemPrompt(room)}
          </pre>
        )}

        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
          {/* Survival Probability Meter */}
          <div className="md:col-span-4 flex flex-col items-center justify-center p-6 rounded-2xl border-2 text-center space-y-2 bg-bunker-950/90 border-bunker-700">
            <span className="text-xs font-mono uppercase tracking-wider text-zinc-400">
              Вероятность выживания колонии
            </span>
            <div
              className={`text-5xl sm:text-6xl font-mono font-black px-6 py-3 rounded-2xl border ${probColor}`}
            >
              {prob}%
            </div>
            <div className="w-full h-2.5 bg-bunker-800 rounded-full overflow-hidden mt-2">
              <div
                className={`h-full transition-all duration-1000 ${
                  prob >= 70
                    ? 'bg-emerald-500'
                    : prob >= 40
                    ? 'bg-amber-500'
                    : 'bg-red-500'
                }`}
                style={{ width: `${prob}%` }}
              />
            </div>
            <span className="text-[11px] font-mono text-zinc-500">
              Срок изоляции: {room.settings.duration} • Площадь: {room.settings.size} м²
            </span>
          </div>

          {/* Verdict Title & Summary */}
          <div className="md:col-span-8 space-y-3">
            <h1 className="text-2xl sm:text-3xl font-black text-zinc-100 tracking-tight">
              {summary.verdictTitle}
            </h1>
            <p className="text-sm sm:text-base text-zinc-200 leading-relaxed">
              {summary.verdictSummary}
            </p>
            <div className="p-3.5 rounded-xl bg-bunker-950/80 border border-bunker-700 space-y-1">
              <div className="text-xs font-mono uppercase text-amber-400">
                Распределение ролей внутри бункера:
              </div>
              <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed">
                {summary.roleDistribution}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Cinematic Epilogue Chapters with Typewriter Animation */}
      {summary.chapters && summary.chapters.length > 0 && (
        <div className="p-5 sm:p-6 rounded-2xl bg-bunker-900 border border-bunker-700 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-mono uppercase tracking-wider text-amber-400 flex items-center gap-2">
              <BookOpen className="w-4 h-4" />
              Хроника бункера #{room.code} (Художественный эпилог)
            </h3>

            <button
              type="button"
              onClick={() => setSkipAnimation(true)}
              className="text-xs font-mono text-zinc-400 hover:text-amber-300 flex items-center gap-1"
            >
              <FastForward className="w-3.5 h-3.5" /> Показать весь текст сразу
            </button>
          </div>

          {/* Chapter Selector Tabs */}
          <div className="flex flex-wrap gap-2">
            {summary.chapters.map((ch, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => {
                  setSkipAnimation(false);
                  setActiveChapterIdx(idx);
                }}
                className={`px-3.5 py-2 rounded-xl text-xs font-mono transition border ${
                  activeChapterIdx === idx
                    ? 'bg-amber-500 text-bunker-950 font-bold border-amber-400'
                    : 'bg-bunker-950 text-zinc-300 border-bunker-700 hover:border-bunker-500'
                }`}
              >
                {ch.number}: {ch.title}
              </button>
            ))}
          </div>

          {/* Active Chapter Display */}
          {currentChapter && (
            <div className="p-5 sm:p-6 rounded-2xl bg-bunker-950 border border-bunker-700 min-h-[160px] space-y-2">
              <div className="text-xs font-mono uppercase text-amber-400">
                {currentChapter.number} — {currentChapter.title}
              </div>
              <p className="text-sm sm:text-base text-zinc-100 leading-relaxed font-serif whitespace-pre-line">
                {typedText}
                {typedText.length < currentChapter.content.length && (
                  <span className="inline-block w-2 h-4 bg-amber-400 ml-1 animate-pulse" />
                )}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Crises & Civilization Outcome */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Internal Crises */}
        <div className="p-5 rounded-2xl bg-bunker-900 border border-bunker-700 space-y-3">
          <h3 className="text-sm font-mono uppercase tracking-wider text-red-400 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            Кризисы внутри бункера
          </h3>
          <div className="space-y-2.5">
            {(summary.crises || []).map((crisis, idx) => (
              <div
                key={idx}
                className="p-3.5 rounded-xl bg-bunker-950 border border-bunker-800 space-y-1"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs sm:text-sm font-bold text-zinc-100">
                    {crisis.title}
                  </span>
                  <span
                    className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded ${
                      crisis.severity === 'critical' || crisis.severity === 'high'
                        ? 'bg-red-500/20 text-red-300'
                        : 'bg-amber-500/20 text-amber-300'
                    }`}
                  >
                    {crisis.severity}
                  </span>
                </div>
                <p className="text-xs text-zinc-300 leading-relaxed">
                  {crisis.description}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Outside Fate & Civilization Verdict */}
        <div className="space-y-5">
          <div className="p-5 rounded-2xl bg-bunker-900 border border-bunker-700 space-y-2">
            <h3 className="text-sm font-mono uppercase tracking-wider text-emerald-400 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4" />
              Открытие люка и судьба цивилизации
            </h3>
            <p className="text-xs sm:text-sm text-zinc-200 leading-relaxed">
              {summary.civilizationOutcome}
            </p>
          </div>

          <div className="p-5 rounded-2xl bg-bunker-900 border border-bunker-700 space-y-2">
            <h3 className="text-sm font-mono uppercase tracking-wider text-zinc-400 flex items-center gap-2">
              <Skull className="w-4 h-4 text-red-400" />
              Судьба изгнанных за гермодверью ({exiled.length})
            </h3>
            <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed">
              {summary.outsideFate}
            </p>
          </div>
        </div>
      </div>

      {/* Full Declassified Dossiers of Survivors */}
      <div className="p-5 rounded-2xl bg-bunker-900 border border-bunker-700 space-y-4">
        <h3 className="text-sm font-mono uppercase tracking-wider text-amber-400 flex items-center gap-2">
          <Users className="w-4 h-4" />
          Полностью рассекреченные досье обитателей бункера ({survivors.length})
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {survivors.map((player) => (
            <div
              key={player.uid}
              className="p-4 rounded-xl bg-bunker-950 border border-emerald-500/30 space-y-2"
            >
              <div className="text-base font-bold text-emerald-300 border-b border-bunker-800 pb-1.5">
                {player.name}
              </div>
              <div className="space-y-1 text-xs">
                {ATTRIBUTE_METADATA.map((meta) => {
                  const card = player.attributes[meta.key];
                  if (!card) return null;
                  return (
                    <div key={meta.key} className="flex justify-between gap-2">
                      <span className="text-zinc-500 font-mono shrink-0">
                        {meta.shortLabel}:
                      </span>
                      <span
                        className={`text-right ${
                          card.revealed ? 'text-zinc-200' : 'text-amber-300'
                        }`}
                      >
                        {card.text}{' '}
                        {!card.revealed && (
                          <span className="text-[10px] font-mono text-amber-400">
                            (было скрыто)
                          </span>
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Return to Lobby Action */}
      {isHost && (
        <div className="flex justify-center pt-2">
          <button
            type="button"
            onClick={() => backToLobby(room.code)}
            className="px-8 py-4 rounded-2xl bg-amber-500 hover:bg-amber-400 text-bunker-950 font-black text-sm font-mono uppercase tracking-wider shadow-xl transition flex items-center gap-2"
          >
            <RotateCcw className="w-4 h-4" />
            Вернуть комнату в Лобби для новой партии
          </button>
        </div>
      )}
    </div>
  );
};

