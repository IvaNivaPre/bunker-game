import React, { useState } from 'react';
import {
  ShieldCheck,
  Users,
  Award,
  Clock,
  Maximize2,
  Package,
  ShieldAlert,
  LogOut,
  Eye,
  DoorOpen,
} from 'lucide-react';
import { ATTRIBUTE_METADATA, RoomData } from '../types/game';
import { deleteRoomCompletely } from '../services/firebaseService';
import { sound } from '../services/soundService';

interface FinaleScreenProps {
  room: RoomData;
  currentUserUid: string;
  onFinishAndCleanup: () => void;
}

export const FinaleScreen: React.FC<FinaleScreenProps> = ({
  room,
  currentUserUid,
  onFinishAndCleanup,
}) => {
  const [showAllHidden, setShowAllHidden] = useState<boolean>(false);
  const [finishing, setFinishing] = useState<boolean>(false);
  const [dismissedExileId, setDismissedExileId] = useState<string | null>(null);

  const playersList = Object.values(room.players || {}).sort(
    (a, b) => a.joinedAt - b.joinedAt
  );
  const survivors = playersList.filter((p) => p.isAlive);
  const exiled = playersList.filter((p) => !p.isAlive);

  // If the final vote just exiled someone to reach FINALE, show the Exile Modal first
  const activeExileModal =
    room.lastExileResult && room.lastExileResult.id !== dismissedExileId
      ? room.lastExileResult
      : null;

  const handleFinishGame = async () => {
    setFinishing(true);
    sound.playClick();
    try {
      await deleteRoomCompletely(room.code);
    } finally {
      onFinishAndCleanup();
    }
  };

  return (
    <div className="max-w-5xl mx-auto p-3 sm:p-6 space-y-6 pb-20">
      {/* Top Standard Victory & Survival Banner */}
      <div className="p-6 sm:p-8 rounded-3xl bg-gradient-to-br from-bunker-900 via-bunker-900 to-emerald-950/30 border-2 border-emerald-500/50 shadow-2xl space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-bunker-700 pb-4">
          <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-emerald-400">
            <Award className="w-4 h-4" />
            <span>ФИНАЛ ИГРЫ // ГЕРМОДВЕРИ БУНКЕРА #{room.code} ЗАПЕЧАТАНЫ</span>
          </div>

          <span className="px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/40 text-xs font-mono text-emerald-300">
            Выживших: {survivors.length} из {playersList.length}
          </span>
        </div>

        <div className="space-y-3">
          <h1 className="text-2xl sm:text-3xl font-black text-zinc-100 tracking-tight">
            БУНКЕР ЗАГЕРМЕТИЗИРОВАН. ПРОТОКОЛ ВЫЖИВАНИЯ ЗАВЕРШЁН!
          </h1>
          <p className="text-sm sm:text-base text-zinc-200 leading-relaxed">
            Бункер загерметизирован. Выжившие успешно дождались окончания изоляции ({room.settings.duration}) и заложили основы нового общества. Все системы жизнеобеспечения выдержали расчётный срок, а сформированная команда преодолела последствия глобальной катастрофы.
          </p>
        </div>

        {/* Final Bunker Parameters Summary */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
          <div className="p-4 rounded-2xl bg-bunker-950/90 border border-bunker-700 flex items-center gap-3">
            <Users className="w-6 h-6 text-emerald-400 shrink-0" />
            <div>
              <div className="text-[11px] font-mono uppercase text-zinc-400">
                Состав колонии
              </div>
              <div className="text-base font-bold text-zinc-100">
                {survivors.length} чел. (вместимость: {room.settings.capacity})
              </div>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-bunker-950/90 border border-bunker-700 flex items-center gap-3">
            <Clock className="w-6 h-6 text-amber-400 shrink-0" />
            <div>
              <div className="text-[11px] font-mono uppercase text-zinc-400">
                Время изоляции
              </div>
              <div className="text-base font-bold text-zinc-100">
                {room.settings.duration}
              </div>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-bunker-950/90 border border-bunker-700 flex items-center gap-3">
            <Maximize2 className="w-6 h-6 text-amber-400 shrink-0" />
            <div>
              <div className="text-[11px] font-mono uppercase text-zinc-400">
                Площадь убежища
              </div>
              <div className="text-base font-bold text-zinc-100">
                {room.settings.size} кв. м
              </div>
            </div>
          </div>
        </div>

        {/* Remaining Supplies & Catastrophe Context */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="p-4 rounded-2xl bg-bunker-950/80 border border-bunker-700 space-y-1.5">
            <div className="text-xs font-mono uppercase text-emerald-400 flex items-center gap-1.5">
              <Package className="w-3.5 h-3.5" /> Итоговые запасы и оснащение бункера:
            </div>
            <p className="text-xs sm:text-sm text-zinc-200 leading-relaxed">
              {room.settings.supplies}
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-bunker-950/80 border border-bunker-700 space-y-1.5">
            <div className="text-xs font-mono uppercase text-red-400 flex items-center gap-1.5">
              <ShieldAlert className="w-3.5 h-3.5" /> Пережитая катастрофа:
            </div>
            <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed">
              {room.settings.catastrophe}
            </p>
          </div>
        </div>
      </div>

      {/* Officially Survived Players List with Revealed Characteristics */}
      <div className="p-5 sm:p-6 rounded-2xl bg-bunker-900 border border-bunker-700 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm sm:text-base font-mono uppercase tracking-wider text-emerald-400 flex items-center gap-2">
            <ShieldCheck className="w-5 h-5" />
            Официальный список выживших в бункере ({survivors.length})
          </h3>

          <button
            type="button"
            onClick={() => setShowAllHidden(!showAllHidden)}
            className="px-3 py-1.5 rounded-xl bg-bunker-950 border border-bunker-700 hover:border-amber-500/50 text-xs font-mono text-amber-300 flex items-center gap-1.5 transition"
          >
            <Eye className="w-3.5 h-3.5" />
            {showAllHidden
              ? 'Показать только открытые в игре карты'
              : 'Рассекретить также закрытые карты'}
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {survivors.map((player, idx) => (
            <div
              key={player.uid}
              className="p-4 rounded-2xl bg-bunker-950 border border-emerald-500/40 space-y-3"
            >
              <div className="flex items-center justify-between border-b border-bunker-800 pb-2">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-lg bg-emerald-500/20 text-emerald-300 font-mono text-xs font-bold flex items-center justify-center">
                    {idx + 1}
                  </span>
                  <span className="text-base font-bold text-zinc-100">
                    {player.name}
                  </span>
                  {player.uid === currentUserUid && (
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300">
                      Вы
                    </span>
                  )}
                </div>
                <span className="text-xs font-mono text-emerald-400">
                  ✓ Допущен в бункер
                </span>
              </div>

              <div className="space-y-1.5 text-xs">
                {ATTRIBUTE_METADATA.filter((m) => m.key !== 'specialCard').map(
                  (meta) => {
                    const card = player.attributes[meta.key];
                    if (!card) return null;
                    const visible = card.revealed || showAllHidden;

                    return (
                      <div
                        key={meta.key}
                        className="flex items-start justify-between gap-2 py-1 border-b border-bunker-900 last:border-0"
                      >
                        <span className="text-zinc-500 font-mono shrink-0">
                          {meta.label}:
                        </span>
                        {visible ? (
                          <span
                            className={`text-right font-medium ${
                              card.revealed ? 'text-zinc-100' : 'text-amber-300'
                            }`}
                          >
                            {card.text}
                            {!card.revealed && (
                              <span className="text-[10px] font-mono text-amber-400 ml-1">
                                (было скрыто)
                              </span>
                            )}
                          </span>
                        ) : (
                          <span className="text-right font-mono text-zinc-600">
                            [Не вскрывалось]
                          </span>
                        )}
                      </div>
                    );
                  }
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Exiled Players Summary */}
      {exiled.length > 0 && (
        <div className="p-5 rounded-2xl bg-bunker-900 border border-bunker-800 space-y-3">
          <h4 className="text-xs font-mono uppercase tracking-wider text-zinc-400">
            Изгнанные по итогам голосования ({exiled.length}):
          </h4>
          <div className="flex flex-wrap gap-2">
            {exiled.map((p) => (
              <span
                key={p.uid}
                className="px-3 py-1.5 rounded-xl bg-bunker-950 border border-red-900/40 text-xs text-zinc-400"
              >
                🚪 {p.name} ({p.attributes.profession?.text || 'Выживший'})
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Finish Game & Delete Room from Firebase Action */}
      <div className="flex flex-col items-center gap-2 pt-2">
        <button
          type="button"
          disabled={finishing}
          onClick={handleFinishGame}
          className="px-8 py-4 rounded-2xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-bunker-950 font-black text-sm font-mono uppercase tracking-wider shadow-xl transition flex items-center gap-2"
        >
          <LogOut className="w-4 h-4" />
          {finishing
            ? 'Завершение и очистка комнаты...'
            : 'Завершить игру и закрыть комнату'}
        </button>
        <span className="text-[11px] font-mono text-zinc-500">
          После завершения данные комнаты #{room.code} автоматически удаляются из базы данных
        </span>
      </div>

      {/* Final Exile Notification Modal if just triggered */}
      {activeExileModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-fadeIn">
          <div className="max-w-lg w-full bg-bunker-900 border-2 border-red-500 rounded-2xl p-6 space-y-5 shadow-2xl">
            <div className="flex items-center gap-3 text-red-400 border-b border-bunker-700 pb-3">
              <div className="w-11 h-11 rounded-xl bg-red-500/15 border border-red-500/40 flex items-center justify-center shrink-0">
                <DoorOpen className="w-6 h-6" />
              </div>
              <div>
                <span className="text-xs font-mono uppercase tracking-wider text-red-400 block">
                  ФИНАЛЬНОЕ ГОЛОСОВАНИЕ • РАУНД {activeExileModal.round}
                </span>
                <h3 className="text-lg font-extrabold text-zinc-100">
                  Итоги трибунала перед герметизацией
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
                Голосов против: {activeExileModal.maxVotes}
              </p>
            </div>

            <div className="space-y-2">
              <div className="text-xs font-mono uppercase text-amber-400">
                Сводка голосов:
              </div>
              <div className="p-3 rounded-xl bg-bunker-950 border border-bunker-800 space-y-1.5 max-h-40 overflow-y-auto text-xs">
                {Object.entries(activeExileModal.tally || {})
                  .sort((a, b) => b[1] - a[1])
                  .map(([candUid, count]) => (
                    <div
                      key={candUid}
                      className="flex items-center justify-between py-1 border-b border-bunker-900 last:border-0"
                    >
                      <span className="font-semibold text-zinc-200">
                        {room.players?.[candUid]?.name || 'Участник'}
                      </span>
                      <span className="font-mono text-amber-400 font-bold">
                        {count} гол.
                      </span>
                    </div>
                  ))}
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
              ОК (Перейти к финалу)
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
