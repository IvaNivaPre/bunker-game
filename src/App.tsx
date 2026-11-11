import React, { useState, useEffect } from 'react';
import { RoomData } from './types/game';
import {
  getOrCreateUserUid,
  saveLastRoomCode,
} from './services/storageService';
import {
  createRoom,
  joinRoom,
  removeOrLeavePlayer,
  subscribeToRoom,
} from './services/firebaseService';
import { HomeScreen } from './components/HomeScreen';
import { LobbyScreen } from './components/LobbyScreen';
import { GameScreen } from './components/GameScreen';
import { FinaleScreen } from './components/FinaleScreen';
import { Header } from './components/Header';
import { AdminModal } from './components/AdminModal';

export const App: React.FC = () => {
  const [userUid] = useState<string>(() => getOrCreateUserUid());
  const [activeRoomCode, setActiveRoomCode] = useState<string | null>(null);
  const [roomData, setRoomData] = useState<RoomData | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isAdminOpen, setIsAdminOpen] = useState<boolean>(false);
  const [, setSettingsTick] = useState<number>(0);

  // Subscribe to real-time updates whenever activeRoomCode is set
  useEffect(() => {
    if (!activeRoomCode) {
      setRoomData(null);
      return;
    }

    const unsubscribe = subscribeToRoom(activeRoomCode, (updatedRoom) => {
      if (!updatedRoom) {
        setErrorMsg(`Комната #${activeRoomCode} была закрыта или удалена.`);
        setActiveRoomCode(null);
        setRoomData(null);
        return;
      }
      // If current user was kicked in LOBBY
      if (updatedRoom.status === 'LOBBY' && !updatedRoom.players?.[userUid]) {
        setErrorMsg('Вы покинули комнату или были исключены Хостом.');
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

  const handleCreateRoom = async (hostName: string, packId: string) => {
    setErrorMsg(null);
    try {
      const created = await createRoom(userUid, hostName, packId);
      saveLastRoomCode(created.code);
      setRoomData(created);
      setActiveRoomCode(created.code);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    }
  };

  const handleJoinRoom = async (code: string, playerName: string) => {
    setErrorMsg(null);
    try {
      const joined = await joinRoom(code, userUid, playerName);
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

  return (
    <div className="min-h-screen bg-bunker-950 text-zinc-100 flex flex-col">
      {roomData && activeRoomCode ? (
        <>
          <Header
            room={roomData}
            onOpenAdmin={() => setIsAdminOpen(true)}
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
                onOpenAdmin={() => setIsAdminOpen(true)}
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
          onOpenAdmin={() => setIsAdminOpen(true)}
          errorMsg={errorMsg}
          clearError={() => setErrorMsg(null)}
        />
      )}

      <AdminModal
        isOpen={isAdminOpen}
        onClose={() => setIsAdminOpen(false)}
        onSettingsChanged={() => setSettingsTick((t) => t + 1)}
      />
    </div>
  );
};

export default App;

