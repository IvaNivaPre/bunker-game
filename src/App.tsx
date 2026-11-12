import React, { useState, useEffect } from 'react';
import { RoomData } from './types/game';
import {
  getOrCreateUserUid,
  saveLastRoomCode,
} from './services/storageService';
import {
  createRoom,
  joinRoom,
  normalizeRoomCode,
  removeOrLeavePlayer,
  subscribeToRoom,
} from './services/firebaseService';
import { HomeScreen } from './components/HomeScreen';
import { LobbyScreen } from './components/LobbyScreen';
import { GameScreen } from './components/GameScreen';
import { FinaleScreen } from './components/FinaleScreen';
import { Header } from './components/Header';
import { AdminModal } from './components/AdminModal';

function checkIsAdminUrl(): boolean {
  if (typeof window === 'undefined') return false;
  const path = window.location.pathname.toLowerCase();
  const hash = window.location.hash.toLowerCase();
  return path.endsWith('/admin') || hash === '#/admin' || hash === '#admin';
}

export const App: React.FC = () => {
  const [userUid] = useState<string>(() => getOrCreateUserUid());
  const [activeRoomCode, setActiveRoomCode] = useState<string | null>(null);
  const [roomData, setRoomData] = useState<RoomData | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isAdminOpen, setIsAdminOpen] = useState<boolean>(() => checkIsAdminUrl());
  const [, setSettingsTick] = useState<number>(0);

  useEffect(() => {
    const onHashOrPop = () => {
      if (checkIsAdminUrl()) {
        setIsAdminOpen(true);
      }
    };
    window.addEventListener('hashchange', onHashOrPop);
    window.addEventListener('popstate', onHashOrPop);
    return () => {
      window.removeEventListener('hashchange', onHashOrPop);
      window.removeEventListener('popstate', onHashOrPop);
    };
  }, []);

  const openAdminPage = () => {
    setIsAdminOpen(true);
    if (typeof window !== 'undefined' && !checkIsAdminUrl()) {
      window.history.replaceState(null, '', '#/admin');
    }
  };

  const closeAdminPage = () => {
    setIsAdminOpen(false);
    if (typeof window !== 'undefined' && checkIsAdminUrl()) {
      window.history.replaceState(null, '', window.location.pathname.replace(/\/admin\/?$/i, '/') || '/');
    }
  };

  useEffect(() => {
    if (!activeRoomCode) {
      setRoomData(null);
      return;
    }

    const unsubscribe = subscribeToRoom(activeRoomCode, (updatedRoom) => {
      if (!updatedRoom) {
        saveLastRoomCode(null);
        setActiveRoomCode(null);
        setRoomData(null);
        return;
      }
      if (updatedRoom.status === 'LOBBY' && !updatedRoom.players?.[userUid]) {
        setErrorMsg('Вы покинули комнату или были исключены Хостом.');
        saveLastRoomCode(null);
        setActiveRoomCode(null);
        setRoomData(null);
        return;
      }
      setRoomData(updatedRoom);
    });

    return () => {
      unsubscribe();
    };
  }, [activeRoomCode, userUid]);

  const handleCreateRoom = async (hostName: string, packIds: string[]) => {
    setErrorMsg(null);
    try {
      const created = await createRoom(userUid, hostName, packIds);
      saveLastRoomCode(created.code);
      setRoomData(created);
      setActiveRoomCode(created.code);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    }
  };

  const handleJoinRoom = async (code: string, playerName: string) => {
    setErrorMsg(null);
    const cleaned = normalizeRoomCode(code);
    try {
      const joined = await joinRoom(cleaned, userUid, playerName);
      saveLastRoomCode(joined.code);
      setRoomData(joined);
      setActiveRoomCode(joined.code);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    }
  };

  const handleLeaveRoom = async () => {
    if (activeRoomCode) {
      try {
        await removeOrLeavePlayer(activeRoomCode, userUid);
      } catch {
        // ignore
      }
    }
    saveLastRoomCode(null);
    setActiveRoomCode(null);
    setRoomData(null);
  };

  const handleFinishAndCleanup = () => {
    saveLastRoomCode(null);
    setActiveRoomCode(null);
    setRoomData(null);
  };

  return (
    <div className="min-h-screen bg-bunker-950 text-zinc-100 flex flex-col">
      {roomData && activeRoomCode ? (
        <>
          <Header
            room={roomData}
            onOpenAdmin={openAdminPage}
            onLeaveRoom={handleLeaveRoom}
          />
          <main className="flex-1">
            {roomData.status === 'LOBBY' ? (
              <LobbyScreen
                room={roomData}
                currentUserUid={userUid}
                onLeaveRoom={handleLeaveRoom}
              />
            ) : roomData.status === 'FINALE' ? (
              <FinaleScreen
                room={roomData}
                currentUserUid={userUid}
                onFinishAndCleanup={handleFinishAndCleanup}
              />
            ) : (
              <GameScreen room={roomData} currentUserUid={userUid} />
            )}
          </main>
        </>
      ) : (
        <HomeScreen
          onCreateRoom={handleCreateRoom}
          onJoinRoom={handleJoinRoom}
          onOpenAdmin={openAdminPage}
          errorMsg={errorMsg}
          clearError={() => setErrorMsg(null)}
        />
      )}

      <AdminModal
        isOpen={isAdminOpen}
        onClose={closeAdminPage}
        onSettingsChanged={() => setSettingsTick((t) => t + 1)}
      />
    </div>
  );
};

export default App;
