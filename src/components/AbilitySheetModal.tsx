import React, { useState } from 'react';
import {
  X,
  Zap,
  Shield,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  UserCheck,
  Eye,
} from 'lucide-react';
import {
  ATTRIBUTE_METADATA,
  AttributeCard,
  AttributeKey,
  PlayerData,
  RoomData,
} from '../types/game';
import { activateAbility, revealAttribute } from '../services/firebaseService';
import { sound } from '../services/soundService';

interface AbilitySheetModalProps {
  isOpen: boolean;
  onClose: () => void;
  room: RoomData;
  currentUserUid: string;
  ownerPlayer: PlayerData;
  sourceKey: 'profession' | 'hobby' | 'specialCard';
  card: AttributeCard;
}

export const AbilitySheetModal: React.FC<AbilitySheetModalProps> = ({
  isOpen,
  onClose,
  room,
  currentUserUid,
  ownerPlayer,
  sourceKey,
  card,
}) => {
  const [selectedTargetUid, setSelectedTargetUid] = useState<string>(ownerPlayer.uid);
  const [selectedAttrKey, setSelectedAttrKey] = useState<AttributeKey>(
    (card.ability?.targetValue as AttributeKey) || 'health'
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !card.ability) return null;

  const ability = card.ability;
  const isOwner = ownerPlayer.uid === currentUserUid;
  const alivePlayers = Object.values(room.players || {}).filter((p) => p.isAlive);

  const needsTargetPlayer = [
    'heal_player',
    'cure_phobia',
    'force_reveal',
    'swap_inventory',
    'swap_backpack',
    'block_vote',
    'reroll_attribute',
  ].includes(ability.effectType);

  const mustTargetOther = [
    'force_reveal',
    'swap_inventory',
    'swap_backpack',
    'block_vote',
  ].includes(ability.effectType);

  const targetCandidates = mustTargetOther
    ? alivePlayers.filter((p) => p.uid !== currentUserUid)
    : alivePlayers;

  const effectiveTargetUid =
    mustTargetOther && selectedTargetUid === currentUserUid
      ? targetCandidates[0]?.uid || currentUserUid
      : selectedTargetUid;

  const typeBadge =
    ability.type === 'instant'
      ? { label: 'Мгновенное применение', color: 'bg-amber-500/20 text-amber-300 border-amber-500/40' }
      : ability.type === 'voting'
      ? { label: 'На фазе голосования', color: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40' }
      : { label: 'Пассивный навык', color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' };

  const sourceLabel =
    sourceKey === 'profession'
      ? 'Профессия'
      : sourceKey === 'hobby'
      ? 'Хобби / Увлечение'
      : 'Спец. возможность';

  const handleActivate = async () => {
    setError(null);
    setLoading(true);
    try {
      if (!card.revealed && sourceKey !== 'specialCard') {
        await revealAttribute(room.code, currentUserUid, sourceKey);
      }
      await activateAbility(
        room.code,
        currentUserUid,
        sourceKey,
        needsTargetPlayer ? effectiveTargetUid : undefined,
        ability.effectType === 'reroll_attribute' ? selectedAttrKey : undefined
      );
      sound.playAbility();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm animate-fadeIn p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-lg bg-bunker-900 border-t-2 sm:border-2 border-amber-500/40 rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top handle for mobile Bottom Sheet */}
        <div className="flex justify-center pt-2.5 sm:hidden">
          <div className="w-12 h-1.5 rounded-full bg-zinc-700" />
        </div>

        {/* Header */}
        <div className="flex items-start justify-between p-4 sm:p-5 border-b border-bunker-700 bg-bunker-950/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/40 flex items-center justify-center text-amber-400 shrink-0">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-mono uppercase tracking-wider text-amber-400/90">
                  {sourceLabel} • {ownerPlayer.name}
                </span>
                <span className={`text-[11px] font-mono px-2 py-0.5 rounded border ${typeBadge.color}`}>
                  {typeBadge.label}
                </span>
              </div>
              <h3 className="text-lg font-bold text-zinc-100 mt-0.5">{ability.name}</h3>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-bunker-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 sm:p-5 space-y-4 max-h-[75vh] overflow-y-auto">
          {/* Card info */}
          <div className="p-3 rounded-xl bg-bunker-950 border border-bunker-700">
            <div className="text-xs font-mono text-zinc-400 mb-1">Карта-источник:</div>
            <div className="text-sm font-medium text-zinc-200">
              {card.revealed || isOwner ? card.text : '[Карта ещё засекречена]'}
            </div>
          </div>

          {/* Ability description */}
          <div className="p-3.5 rounded-xl bg-amber-500/5 border border-amber-500/25 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" /> Описание спец. способности
              </span>
              {ability.used ? (
                <span className="text-xs font-mono text-zinc-400 bg-zinc-800 px-2 py-0.5 rounded flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> Использована
                </span>
              ) : (
                <span className="text-xs font-mono text-emerald-300 bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 rounded">
                  Активна
                </span>
              )}
            </div>
            <p className="text-sm text-zinc-200 leading-relaxed">{ability.description}</p>
          </div>

          {/* Interactive controls for owner if ability is unused */}
          {isOwner && !ability.used && ownerPlayer.isAlive && room.status !== 'LOBBY' && room.status !== 'FINALE' && (
            <div className="space-y-3 pt-1">
              {!card.revealed && sourceKey !== 'specialCard' && (
                <div className="flex items-center gap-2 text-xs text-amber-300 bg-amber-500/10 border border-amber-500/30 p-2.5 rounded-lg">
                  <Eye className="w-4 h-4 shrink-0" />
                  <span>
                    При нажатии «Применить способность» ваша карта «{sourceLabel}» будет автоматически вскрыта для всех участников.
                  </span>
                </div>
              )}

              {needsTargetPlayer && targetCandidates.length > 0 && (
                <div>
                  <label className="block text-xs font-mono uppercase text-zinc-400 mb-1.5 flex items-center gap-1.5">
                    <UserCheck className="w-3.5 h-3.5 text-amber-400" />
                    Выберите цель применения:
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {targetCandidates.map((p) => {
                      const isSelected = p.uid === effectiveTargetUid;
                      return (
                        <button
                          key={p.uid}
                          type="button"
                          onClick={() => setSelectedTargetUid(p.uid)}
                          className={`p-2.5 rounded-xl border text-left transition flex items-center justify-between ${
                            isSelected
                              ? 'bg-amber-500/20 border-amber-500 text-amber-200'
                              : 'bg-bunker-950 border-bunker-700 text-zinc-300 hover:border-bunker-500'
                          }`}
                        >
                          <span className="text-sm font-medium truncate">
                            {p.name} {p.uid === currentUserUid ? '(Вы)' : ''}
                          </span>
                          {isSelected && <Shield className="w-4 h-4 text-amber-400 shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {ability.effectType === 'reroll_attribute' && (
                <div>
                  <label className="block text-xs font-mono uppercase text-zinc-400 mb-1.5">
                    Характеристика для переброса:
                  </label>
                  <select
                    value={selectedAttrKey}
                    onChange={(e) => setSelectedAttrKey(e.target.value as AttributeKey)}
                    className="w-full bg-bunker-950 border border-bunker-700 rounded-xl px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-amber-500"
                  >
                    {ATTRIBUTE_METADATA.filter((m) => m.key !== 'specialCard').map((m) => (
                      <option key={m.key} value={m.key}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {error && (
                <div className="p-2.5 rounded-lg bg-red-500/15 border border-red-500/40 text-xs text-red-300 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <button
                type="button"
                disabled={loading}
                onClick={handleActivate}
                className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-bunker-950 font-bold text-sm uppercase tracking-wider shadow-lg shadow-amber-500/20 transition flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <Zap className="w-4 h-4" />
                {loading
                  ? 'Активация...'
                  : !card.revealed && sourceKey !== 'specialCard'
                  ? 'Вскрыть карту и применить способность'
                  : 'Применить способность'}
              </button>
            </div>
          )}

          {isOwner && room.status === 'LOBBY' && (
            <div className="text-xs font-mono text-zinc-400 text-center py-2 bg-bunker-950 rounded-lg border border-bunker-800">
              Способности можно активировать после старта игры.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

