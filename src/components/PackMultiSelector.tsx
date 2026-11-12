import React, { useState, useMemo } from 'react';
import {
  Search,
  CheckSquare,
  Square,
  ArrowUpDown,
  Tag,
  Package,
  Layers,
} from 'lucide-react';
import { GamePack, PackSortOption, getPackTotalCards } from '../types/game';

interface PackMultiSelectorProps {
  packs: GamePack[];
  selectedPackIds: string[];
  onChange: (nextIds: string[]) => void;
  disabled?: boolean;
}

export const PackMultiSelector: React.FC<PackMultiSelectorProps> = ({
  packs,
  selectedPackIds,
  onChange,
  disabled = false,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState<string>('all');
  const [sortBy, setSortBy] = useState<PackSortOption>('date');

  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const p of packs) {
      for (const t of p.tags || []) {
        if (t.trim()) set.add(t.trim().toLowerCase());
      }
    }
    return Array.from(set);
  }, [packs]);

  const filteredAndSortedPacks = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const filtered = packs.filter((p) => {
      if (selectedTag !== 'all') {
        const packTags = (p.tags || []).map((t) => t.toLowerCase());
        if (!packTags.includes(selectedTag)) return false;
      }
      if (!q) return true;
      const inName = p.name.toLowerCase().includes(q);
      const inDesc = (p.description || '').toLowerCase().includes(q);
      const inTags = (p.tags || []).some((t) => t.toLowerCase().includes(q));
      return inName || inDesc || inTags;
    });

    return filtered.sort((a, b) => {
      if (sortBy === 'alphabet') {
        return a.name.localeCompare(b.name, 'ru');
      }
      if (sortBy === 'cardsCount') {
        return getPackTotalCards(b) - getPackTotalCards(a);
      }
      return (b.createdAt || 0) - (a.createdAt || 0);
    });
  }, [packs, searchQuery, selectedTag, sortBy]);

  const selectedPacksList = useMemo(
    () => packs.filter((p) => selectedPackIds.includes(p.id)),
    [packs, selectedPackIds]
  );

  const selectedNamesSummary =
    selectedPacksList.map((p) => p.name).join(', ') || 'Не выбрано';

  const totalCombinedCards = useMemo(
    () =>
      selectedPacksList.reduce((acc, p) => acc + getPackTotalCards(p), 0),
    [selectedPacksList]
  );

  const togglePack = (packId: string) => {
    if (disabled) return;
    if (selectedPackIds.includes(packId)) {
      if (selectedPackIds.length <= 1) return; // Keep at least 1 pack selected
      onChange(selectedPackIds.filter((id) => id !== packId));
    } else {
      onChange([...selectedPackIds, packId]);
    }
  };

  return (
    <div className="space-y-3">
      {/* Comma-separated summary banner */}
      <div className="p-3 rounded-xl bg-bunker-950 border border-amber-500/30 flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs leading-relaxed">
          <span className="font-mono uppercase text-amber-400 mr-1.5">
            Набор ({selectedPacksList.length}):
          </span>
          <span className="font-semibold text-zinc-100">
            {selectedNamesSummary}
          </span>
        </div>
        <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 shrink-0 flex items-center gap-1">
          <Layers className="w-3 h-3" /> {totalCombinedCards} карт в пуле
        </span>
      </div>

      {/* Search, Tag Filter, and Sort Controls */}
      {!disabled && (
        <div className="space-y-2">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {/* Search input */}
            <div className="sm:col-span-2 relative">
              <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Поиск пака по названию, описанию или тегу..."
                className="w-full bg-bunker-950 border border-bunker-700 rounded-xl pl-8 pr-3 py-2 text-xs text-zinc-100 focus:outline-none focus:border-amber-500"
              />
            </div>

            {/* Sort dropdown */}
            <div className="relative">
              <ArrowUpDown className="w-3.5 h-3.5 text-amber-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as PackSortOption)}
                className="w-full bg-bunker-950 border border-bunker-700 rounded-xl pl-8 pr-2.5 py-2 text-xs font-mono text-zinc-200 focus:outline-none focus:border-amber-500"
              >
                <option value="date">Сортировка: По дате</option>
                <option value="alphabet">Сортировка: По алфавиту</option>
                <option value="cardsCount">Сортировка: По кол-ву карт</option>
              </select>
            </div>
          </div>

          {/* Tag Filter Pills */}
          {allTags.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] font-mono uppercase text-zinc-500 flex items-center gap-1 mr-1">
                <Tag className="w-3 h-3" /> Теги:
              </span>
              <button
                type="button"
                onClick={() => setSelectedTag('all')}
                className={`px-2 py-0.5 rounded-md text-[11px] font-mono transition ${
                  selectedTag === 'all'
                    ? 'bg-amber-500 text-bunker-950 font-bold'
                    : 'bg-bunker-950 text-zinc-400 border border-bunker-800 hover:text-zinc-200'
                }`}
              >
                Все
              </button>
              {allTags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => setSelectedTag(tag === selectedTag ? 'all' : tag)}
                  className={`px-2 py-0.5 rounded-md text-[11px] font-mono transition ${
                    selectedTag === tag
                      ? 'bg-amber-500 text-bunker-950 font-bold'
                      : 'bg-bunker-950 text-zinc-400 border border-bunker-800 hover:text-zinc-200'
                  }`}
                >
                  #{tag}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Multi-select Pack Cards List */}
      <div className="grid grid-cols-1 gap-2 max-h-56 overflow-y-auto pr-1">
        {filteredAndSortedPacks.map((pack) => {
          const isChecked = selectedPackIds.includes(pack.id);
          const cardsCount = getPackTotalCards(pack);

          return (
            <button
              key={pack.id}
              type="button"
              disabled={disabled}
              onClick={() => togglePack(pack.id)}
              className={`p-3 rounded-xl border text-left transition flex items-start justify-between gap-3 ${
                isChecked
                  ? 'bg-amber-500/15 border-amber-500/60 text-zinc-100'
                  : 'bg-bunker-950 border-bunker-800 text-zinc-400 hover:border-bunker-600'
              } ${disabled ? 'opacity-75 cursor-default' : ''}`}
            >
              <div className="flex items-start gap-2.5 min-w-0">
                <div className="mt-0.5 text-amber-400 shrink-0">
                  {isChecked ? (
                    <CheckSquare className="w-4 h-4" />
                  ) : (
                    <Square className="w-4 h-4 text-zinc-600" />
                  )}
                </div>
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs sm:text-sm font-bold text-zinc-100">
                      {pack.name}
                    </span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-bunker-800 text-amber-300 flex items-center gap-1">
                      <Package className="w-3 h-3" /> {cardsCount} карт
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-400 line-clamp-2">
                    {pack.description}
                  </p>
                  {pack.tags && pack.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-0.5">
                      {pack.tags.map((t) => (
                        <span
                          key={t}
                          className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-bunker-900 border border-bunker-700 text-zinc-400"
                        >
                          #{t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </button>
          );
        })}

        {filteredAndSortedPacks.length === 0 && (
          <div className="p-4 text-center text-xs font-mono text-zinc-500 bg-bunker-950 rounded-xl border border-bunker-800">
            Ничего не найдено по вашему запросу.
          </div>
        )}
      </div>
    </div>
  );
};

