import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

interface MediaPlayerContextType {
  activePlayerId: string | null;
  requestPlay: (playerId: string) => void;
  releasePlay: (playerId: string) => void;
}

const MediaPlayerContext = createContext<MediaPlayerContextType>({
  activePlayerId: null,
  requestPlay: () => {},
  releasePlay: () => {},
});

export function MediaPlayerProvider({ children }: { children: ReactNode }) {
  const [activePlayerId, setActivePlayerId] = useState<string | null>(null);

  const requestPlay = useCallback((playerId: string) => {
    setActivePlayerId(playerId);
  }, []);

  const releasePlay = useCallback((playerId: string) => {
    setActivePlayerId(prev => prev === playerId ? null : prev);
  }, []);

  return (
    <MediaPlayerContext.Provider value={{ activePlayerId, requestPlay, releasePlay }}>
      {children}
    </MediaPlayerContext.Provider>
  );
}

export const useMediaPlayer = () => useContext(MediaPlayerContext);
