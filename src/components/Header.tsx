import React, { useState } from 'react';
import {
  ShieldAlert,
  Copy,
  Check,
  Volume2,
  VolumeX,
  Settings,
  LogOut,
  Database,
} from 'lucide-react';
import { RoomData } from '../types/game';
import { getSoundEnabled, setSoundEnabled } from '../services/storageService';
import { getSyncMode } from '../services/firebaseService';
import { sound } from '../services/soundService';

interface HeaderProps {
  room: RoomData;
  onOpenAdmin: () => void;
  onLeaveRoom: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  room,
  onOpenAdmin,
  onLeaveRoom,
}) => {
  const [copied, setCopied] = useState(false);
  const [soundOn, setSoundOn] = useState(getSoundEnabled());
  const syncMode = getSyncMode();

  const handleCopy = () => {
    navigator.clipboard.writeText(room.code);
    sound.playClick();
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const toggleSound = () => {
    const next = !soundOn;
    setSoundOn(next);
    setSoundEnabled(next);
    if (next) sound.playClick();
  };

  return (
    <header className="sticky top-0 z-30 bg-bunker-950/90 backdrop-blur-md border-b border-bunker-800 px-3 sm:px-6 py-2.5">
      <div className="max-w-6xl mx-auto flex items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-amber-500/15 border border-amber-500/40 flex items-center justify-center text-amber-400">
              <ShieldAlert className="w-4 h-4" />
            </div>
            <span className="font-extrabold text-sm sm:text-base tracking-tight text-zinc-100 hidden xs:inline">
              БУНКЕР <span className="text-amber-400">ОНЛАЙН</span>
            </span>
          </div>

          <button
            type="button"
            onClick={handleCopy}
            className="px-2.5 py-1 rounded-lg bg-bunker-900 border border-amber-500/40 hover:border-amber-400 flex items-center gap-1.5 font-mono text-xs font-bold text-amber-300 transition"
            title="Скопировать 3-значный код комнаты"
          >
            <span>КОД: {room.code}</span>
            {copied ? (
              <Check className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <Copy className="w-3.5 h-3.5 text-zinc-400" />
            )}
          </button>

          <span className="hidden md:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-bunker-900 border border-bunker-800 text-[11px] font-mono text-zinc-400">
            <Database
              className={`w-3 h-3 ${
                syncMode !== 'local' ? 'text-emerald-400' : 'text-amber-400'
              }`}
            />
            {syncMode !== 'local' ? 'Firebase Live' : 'Локальный синк'}
          </span>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={toggleSound}
            className="p-2 rounded-lg bg-bunker-900 border border-bunker-700 text-zinc-400 hover:text-zinc-100 transition"
            title={soundOn ? 'Звук включён' : 'Звук выключен'}
          >
            {soundOn ? (
              <Volume2 className="w-4 h-4 text-amber-400" />
            ) : (
              <VolumeX className="w-4 h-4" />
            )}
          </button>

          <button
            type="button"
            onClick={onOpenAdmin}
            className="px-2.5 py-1.5 rounded-lg bg-bunker-900 border border-bunker-700 hover:border-amber-500/50 text-xs font-mono text-zinc-300 flex items-center gap-1.5 transition"
          >
            <Settings className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden sm:inline">Настройки</span>
          </button>

          <button
            type="button"
            onClick={onLeaveRoom}
            className="px-2.5 py-1.5 rounded-lg bg-red-500/15 border border-red-500/30 hover:bg-red-500/25 text-xs font-mono text-red-300 flex items-center gap-1.5 transition"
            title="Выйти на главную"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Выход</span>
          </button>
        </div>
      </div>
    </header>
  );
};

